import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { EcoBuildOnResolveArgs, EcoBuildOnResolveResult, EcoBuildPlugin } from '../../build/build-types.ts';
import type { NodeRuntimeManifest } from '../../services/node-runtime-manifest.service.ts';
import { resolveInternalExecutionDir } from '../../utils/resolve-work-dir.ts';

/**
 * Returns the runtime-local node_modules directory used by the Node thin-host
 * bootstrap output.
 */
export function getNodeRuntimeNodeModulesDir(manifest: NodeRuntimeManifest): string {
	return path.join(
		resolveInternalExecutionDir({
			rootDir: manifest.appRootDir,
			workDir: manifest.workDir,
			absolutePaths: {
				workDir: manifest.workDir,
				distDir: manifest.distDir,
			},
		}),
		'node_modules',
	);
}

/**
 * Derives the package root segment from a bare specifier.
 */
function getPackageNameFromSpecifier(specifier: string): string {
	if (specifier.startsWith('@')) {
		const [scope, name] = specifier.split('/');
		return `${scope}/${name}`;
	}

	return specifier.split('/')[0] ?? specifier;
}

/**
 * Walks upward from a resolved file until it finds the owning package root.
 */
function findPackageRoot(resolvedPath: string): string {
	let currentPath = path.dirname(resolvedPath);

	while (true) {
		const packageJsonPath = path.join(currentPath, 'package.json');
		if (existsSync(packageJsonPath)) {
			return currentPath;
		}

		const parentPath = path.dirname(currentPath);
		if (parentPath === currentPath) {
			throw new Error(`Could not find package root for resolved dependency path: ${resolvedPath}`);
		}

		currentPath = parentPath;
	}
}

/**
 * Creates a runtime-local symlink for one external dependency package.
 *
 * @remarks
 * Node thin-host bootstrap bundles externalize third-party packages but still
 * need those packages to resolve from a deterministic runtime-local
 * `node_modules` directory. Symlinking the package root preserves that lookup
 * without copying package contents into the app cache.
 */
function ensureRuntimePackageLink(nodeModulesDir: string, specifier: string, resolvedPath: string): void {
	const packageName = getPackageNameFromSpecifier(specifier);
	const packageRoot = findPackageRoot(resolvedPath);
	const linkPath = path.join(nodeModulesDir, packageName);

	if (existsSync(linkPath)) {
		return;
	}

	mkdirSync(path.dirname(linkPath), { recursive: true });
	symlinkSync(packageRoot, linkPath, 'dir');
}

export interface NodeBootstrapResolutionOptions {
	projectDir: string;
	runtimeNodeModulesDir: string;
	preserveImportMetaPaths?: string[];
}

/**
 * Builds the user-facing error for Bun-native imports that cannot run on the
 * Node thin-host bootstrap path.
 */
export function getNodeUnsupportedBuiltinError(specifier: string, importer?: string): string {
	return `Node thin-host bootstrap does not support Bun builtin specifier ${JSON.stringify(specifier)}${importer ? ` imported from ${importer}` : ''}.`;
}

/**
 * Returns whether a dependency should be resolved relative to the importing
 * package instead of the app root.
 */
function shouldResolveFromImporter(importer: string | undefined): importer is string {
	return Boolean(importer && importer.includes(`${path.sep}node_modules${path.sep}`));
}

/**
 * Selects the build loader used when bootstrap-time source rewriting emits a
 * synthetic in-memory file.
 */
function getBootstrapBuildLoaderForPath(filePath: string): 'js' | 'jsx' | 'json' | 'ts' | 'tsx' {
	switch (path.extname(filePath).toLowerCase()) {
		case '.ts':
		case '.mts':
		case '.cts':
			return 'ts';
		case '.tsx':
			return 'tsx';
		case '.jsx':
			return 'jsx';
		case '.json':
			return 'json';
		default:
			return 'js';
	}
}

const REEXPORT_FROM_STATEMENT_PATTERN =
	/^\s*export\s+(?!type\b)(?:\*|\{[\s\S]*?\})\s+from\s+(['"][^'"]+['"])\s*;?\s*$/gm;

/**
 * Prepends side-effect imports for re-export barrels during bootstrap bundling.
 *
 * @remarks
 * This keeps async module initialization observable even when the bootstrap
 * bundle only referenced the file through re-export syntax.
 */
function injectBootstrapReexportImports(source: string): string {
	const sideEffectImports: string[] = [];
	const importedSpecifiers = new Set<string>();
	let importIndex = 0;

	const rewrittenSource = source.replace(REEXPORT_FROM_STATEMENT_PATTERN, (statement, specifierLiteral: string) => {
		if (!importedSpecifiers.has(specifierLiteral)) {
			importedSpecifiers.add(specifierLiteral);
			const importBinding = `__eco_bootstrap_reexport_${importIndex++}`;
			sideEffectImports.push(`import * as ${importBinding} from ${specifierLiteral};`);
			sideEffectImports.push(`void ${importBinding};`);
		}

		return statement;
	});

	if (sideEffectImports.length === 0) {
		return source;
	}

	return `${sideEffectImports.join('\n')}\n${rewrittenSource}`;
}

/**
 * Returns whether bootstrap source rewriting is allowed for the given file.
 *
 * @remarks
 * Re-export and `import.meta` rewrites are limited to project-owned sources so
 * third-party packages keep their original semantics.
 */
function shouldRewriteBootstrapSource(filePath: string, projectDir: string): boolean {
	const normalizedPath = path.resolve(filePath);
	const normalizedProjectDir = path.resolve(projectDir);

	return (
		normalizedPath.startsWith(`${normalizedProjectDir}${path.sep}`) &&
		!normalizedPath.includes(`${path.sep}node_modules${path.sep}`)
	);
}

/**
 * Resolves one bare specifier encountered while bundling Node thin-host
 * bootstrap modules.
 *
 * Workspace-owned `@ecopages/*` packages stay in the bundle graph so Node does
 * not execute their source files directly. Third-party packages stay external,
 * but are linked into the runtime-local `node_modules` tree so the generated
 * bootstrap output resolves them from a deterministic location.
 */
export function resolveNodeBootstrapDependency(
	args: Pick<EcoBuildOnResolveArgs, 'path' | 'importer'>,
	options: NodeBootstrapResolutionOptions,
): EcoBuildOnResolveResult | undefined {
	if (
		args.path.startsWith('./') ||
		args.path.startsWith('../') ||
		args.path.startsWith('@/') ||
		args.path.startsWith('/') ||
		args.path.startsWith('node:')
	) {
		return undefined;
	}

	const projectRequire = createRequire(path.join(options.projectDir, 'package.json'));
	const requireFromImporter =
		args.importer && path.isAbsolute(args.importer) && shouldResolveFromImporter(args.importer)
			? createRequire(args.importer)
			: projectRequire;

	if (args.path.startsWith('@ecopages/')) {
		return {
			path: requireFromImporter.resolve(args.path),
		};
	}

	const resolvedPath = requireFromImporter.resolve(args.path);

	ensureRuntimePackageLink(options.runtimeNodeModulesDir, args.path, resolvedPath);

	return {
		path: args.path,
		external: true,
	};
}

/**
 * Creates the bootstrap-time resolver plugin used by the Node thin-host
 * adapter for config and entry module loading.
 */
export function createNodeBootstrapPlugin(options: NodeBootstrapResolutionOptions): EcoBuildPlugin {
	const projectDir = path.resolve(options.projectDir);
	const importMetaRewritePaths = new Set(
		(options.preserveImportMetaPaths ?? []).map((filePath) => path.resolve(filePath)),
	);

	return {
		name: 'node-thin-host-bundle-workspace-packages',
		setup(build) {
			build.onResolve({ filter: /^bun:/ }, (args) => {
				throw new Error(getNodeUnsupportedBuiltinError(args.path, args.importer));
			});

			build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
				const absolutePath = path.resolve(args.path);
				const shouldPreserveImportMeta = importMetaRewritePaths.has(absolutePath);
				const shouldRewriteReexports = shouldRewriteBootstrapSource(absolutePath, projectDir);

				if (!shouldPreserveImportMeta && !shouldRewriteReexports) {
					return undefined;
				}

				const originalContents = readFileSync(args.path, 'utf8');
				let contents = originalContents;

				if (shouldPreserveImportMeta) {
					contents = contents
						.replaceAll('import.meta.dirname', JSON.stringify(path.dirname(args.path)))
						.replaceAll('import.meta.filename', JSON.stringify(args.path));
				}

				if (shouldRewriteReexports) {
					contents = injectBootstrapReexportImports(contents);
				}

				if (contents === originalContents) {
					return undefined;
				}

				return {
					contents,
					loader: getBootstrapBuildLoaderForPath(args.path),
					resolveDir: path.dirname(args.path),
				};
			});

			build.onResolve({ filter: /^[@A-Za-z0-9][^:]*$/ }, (args) => {
				return resolveNodeBootstrapDependency(args, options);
			});
		},
	};
}
