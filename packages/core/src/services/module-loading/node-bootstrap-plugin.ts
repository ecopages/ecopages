import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { EcoBuildOnResolveArgs, EcoBuildOnResolveResult, EcoBuildPlugin } from '../../build/build-types.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { resolveInternalExecutionDir } from '../../utils/resolve-work-dir.ts';

/**
 * Returns the app-local node_modules directory used by framework-owned Node
 * bootstrap loads outside the thin-host manifest path.
 */
export function getAppRuntimeNodeModulesDir(
	appConfig: Pick<EcoPagesAppConfig, 'rootDir' | 'workDir' | 'absolutePaths'>,
): string {
	return path.join(resolveInternalExecutionDir(appConfig), 'node_modules');
}

function getPackageNameFromSpecifier(specifier: string): string {
	if (specifier.startsWith('@')) {
		const [scope, name] = specifier.split('/');
		return `${scope}/${name}`;
	}

	return specifier.split('/')[0] ?? specifier;
}

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
 * Node bootstrap transpile path.
 */
export function getNodeUnsupportedBuiltinError(specifier: string, importer?: string): string {
	return `Node bootstrap transpilation does not support Bun builtin specifier ${JSON.stringify(specifier)}${importer ? ` imported from ${importer}` : ''}.`;
}

function shouldResolveFromImporter(importer: string | undefined): importer is string {
	return Boolean(importer && importer.includes(`${path.sep}node_modules${path.sep}`));
}

function resolveSpecifier(specifier: string, parentPath: string): string {
	try {
		return createRequire(parentPath).resolve(specifier);
	} catch {
		return fileURLToPath(import.meta.resolve(specifier, pathToFileURL(parentPath).href));
	}
}

function resolveFromCore(specifier: string): string {
	return createRequire(import.meta.url).resolve(specifier);
}

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

function shouldRewriteBootstrapSource(filePath: string, projectDir: string): boolean {
	const normalizedPath = path.resolve(filePath);
	const normalizedProjectDir = path.resolve(projectDir);

	return (
		normalizedPath.startsWith(`${normalizedProjectDir}${path.sep}`) &&
		!normalizedPath.includes(`${path.sep}node_modules${path.sep}`)
	);
}

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

	const resolveParent =
		args.importer && path.isAbsolute(args.importer) && shouldResolveFromImporter(args.importer)
			? args.importer
			: path.join(options.projectDir, 'package.json');

	if (args.path.startsWith('@ecopages/')) {
		let resolvedPath: string;
		try {
			resolvedPath = resolveFromCore(args.path);
		} catch {
			resolvedPath = resolveSpecifier(args.path, resolveParent);
		}

		if (resolvedPath.includes(`${path.sep}node_modules${path.sep}`)) {
			ensureRuntimePackageLink(options.runtimeNodeModulesDir, args.path, resolvedPath);
			return {
				path: args.path,
				external: true,
			};
		}

		return { path: resolvedPath };
	}

	const resolvedPath = resolveSpecifier(args.path, resolveParent);
	ensureRuntimePackageLink(options.runtimeNodeModulesDir, args.path, resolvedPath);

	return {
		path: args.path,
		external: true,
	};
}

export function createNodeBootstrapPlugin(options: NodeBootstrapResolutionOptions): EcoBuildPlugin {
	const projectDir = path.resolve(options.projectDir);
	const importMetaRewritePaths = new Set(
		(options.preserveImportMetaPaths ?? []).map((filePath) => path.resolve(filePath)),
	);

	return {
		name: 'node-bootstrap-plugin',
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

export function createAppNodeBootstrapPlugin(
	appConfig: Pick<EcoPagesAppConfig, 'rootDir' | 'workDir' | 'absolutePaths'>,
	options?: {
		preserveImportMetaPaths?: string[];
	},
): EcoBuildPlugin {
	return createNodeBootstrapPlugin({
		projectDir: appConfig.rootDir,
		runtimeNodeModulesDir: getAppRuntimeNodeModulesDir(appConfig),
		preserveImportMetaPaths: options?.preserveImportMetaPaths,
	});
}
