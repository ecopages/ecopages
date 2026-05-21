import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { EcoBuildOnResolveArgs, EcoBuildOnResolveResult, EcoBuildPlugin } from '../../build/build-types.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { resolveInternalExecutionDir } from '../../utils/resolve-work-dir.ts';

type PackageManifest = {
	name?: string;
	main?: string;
	module?: string;
	exports?: unknown;
};

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

export interface NodeBootstrapResolutionOptions {
	/**
	 * App root used as the fallback package boundary when an importer does not
	 * live under a more specific package.json.
	 */
	projectDir: string;
	/**
	 * Runtime-local node_modules directory retained for backwards-compatible
	 * option shape. Third-party packages now resolve through native Node lookup.
	 */
	runtimeNodeModulesDir: string;
}

/**
 * Builds the user-facing error for Bun-native imports that cannot run on the
 * Node bootstrap transpile path.
 */
export function getNodeUnsupportedBuiltinError(specifier: string, importer?: string): string {
	return `Node bootstrap transpilation does not support Bun builtin specifier ${JSON.stringify(specifier)}${importer ? ` imported from ${importer}` : ''}.`;
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

function readPackageManifest(packageDir: string): PackageManifest | undefined {
	const packageJsonPath = path.join(packageDir, 'package.json');
	if (!existsSync(packageJsonPath)) {
		return undefined;
	}

	try {
		return JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageManifest;
	} catch {
		return undefined;
	}
}

function findInstalledPackageDir(packageName: string, parentPath: string): string | undefined {
	let currentPath = path.dirname(parentPath);
	const packageSegments = packageName.split('/');

	while (true) {
		const candidateDir = path.join(currentPath, 'node_modules', ...packageSegments);
		if (existsSync(path.join(candidateDir, 'package.json'))) {
			return candidateDir;
		}

		const nextPath = path.dirname(currentPath);
		if (nextPath === currentPath) {
			return undefined;
		}

		currentPath = nextPath;
	}
}

function resolvePackageExportTarget(packageDir: string, target: unknown): string | undefined {
	if (typeof target === 'string') {
		return path.resolve(packageDir, target);
	}

	if (Array.isArray(target)) {
		for (const candidate of target) {
			const resolvedTarget = resolvePackageExportTarget(packageDir, candidate);
			if (resolvedTarget) {
				return resolvedTarget;
			}
		}

		return undefined;
	}

	if (!target || typeof target !== 'object') {
		return undefined;
	}

	const record = target as Record<string, unknown>;
	return (
		resolvePackageExportTarget(packageDir, record.import) ??
		resolvePackageExportTarget(packageDir, record.default) ??
		resolvePackageExportTarget(packageDir, record.require)
	);
}

function shouldRewriteProjectImportMeta(filePath: string, projectDir: string): boolean {
	const normalizedFilePath = path.normalize(filePath);
	const normalizedProjectDir = path.normalize(projectDir);

	return (
		(normalizedFilePath === normalizedProjectDir ||
			normalizedFilePath.startsWith(`${normalizedProjectDir}${path.sep}`)) &&
		!normalizedFilePath.includes(`${path.sep}node_modules${path.sep}`)
	);
}

function getLoaderForPath(filePath: string) {
	const extension = path.extname(filePath).toLowerCase();

	if (extension === '.tsx') return 'tsx';
	if (extension === '.ts') return 'ts';
	if (extension === '.jsx') return 'jsx';
	return 'js';
}

function resolveInstalledPackageTarget(specifier: string, parentPath: string): string | undefined {
	const packageName = getPackageNameFromSpecifier(specifier);
	const packageDir = findInstalledPackageDir(packageName, parentPath);
	if (!packageDir) {
		return undefined;
	}

	const manifest = readPackageManifest(packageDir);
	if (!manifest) {
		return undefined;
	}

	const subpath = specifier === packageName ? '.' : `./${specifier.slice(packageName.length + 1)}`;
	const exportsField = manifest.exports;

	if (exportsField !== undefined) {
		const exportsRecord = exportsField as Record<string, unknown>;
		const hasSubpathKeys =
			typeof exportsField === 'object' &&
			exportsField !== null &&
			Object.keys(exportsRecord).some((key) => key.startsWith('.'));
		const exportTarget = hasSubpathKeys
			? resolvePackageExportTarget(packageDir, exportsRecord[subpath])
			: subpath === '.'
				? resolvePackageExportTarget(packageDir, exportsField)
				: undefined;

		if (exportTarget && existsSync(exportTarget)) {
			return exportTarget;
		}
	}

	if (subpath !== '.') {
		return undefined;
	}

	const mainTarget = manifest.module ?? manifest.main ?? 'index.js';
	const resolvedMainTarget = path.resolve(packageDir, mainTarget);
	return existsSync(resolvedMainTarget) ? resolvedMainTarget : undefined;
}

function findResolutionParent(importer: string | undefined, projectDir: string): string {
	if (!importer || !path.isAbsolute(importer)) {
		return path.join(projectDir, 'package.json');
	}

	let currentPath = path.dirname(importer);

	while (true) {
		const packageJsonPath = path.join(currentPath, 'package.json');
		if (existsSync(packageJsonPath)) {
			return packageJsonPath;
		}

		const parentPath = path.dirname(currentPath);
		if (parentPath === currentPath) {
			return path.join(projectDir, 'package.json');
		}

		currentPath = parentPath;
	}
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

	const resolveParent = findResolutionParent(args.importer, options.projectDir);

	if (args.path.startsWith('@ecopages/')) {
		const packageName = getPackageNameFromSpecifier(args.path);
		const isBareWorkspacePackage = args.path === packageName;
		const installedResolvedPath = resolveInstalledPackageTarget(args.path, resolveParent);

		if (installedResolvedPath) {
			return { path: installedResolvedPath };
		}

		if (!isBareWorkspacePackage) {
			const resolvedSubpath = resolveSpecifier(args.path, resolveParent);
			return { path: resolvedSubpath };
		}

		let resolvedPath: string | undefined;
		try {
			resolvedPath = resolveFromCore(args.path);
		} catch {
			try {
				resolvedPath = resolveSpecifier(args.path, resolveParent);
			} catch {
				const candidatePath = path.join(options.projectDir, 'node_modules', packageName);
				const candidatePackageJson = path.join(candidatePath, 'package.json');
				if (existsSync(candidatePackageJson)) {
					return { path: args.path, external: true };
				}
			}
		}

		if (!resolvedPath) {
			return undefined;
		}

		if (resolvedPath.includes(`${path.sep}node_modules${path.sep}`)) {
			return {
				path: args.path,
				external: true,
			};
		}

		return { path: resolvedPath };
	}

	return {
		path: args.path,
		external: true,
	};
}

/**
 * Creates the Node bootstrap plugin used by app-owned server module loads.
 *
 * The resolver keeps third-party imports external so native Node package
 * semantics decide exports, subpaths, and CommonJS interop at runtime.
 */
export function createNodeBootstrapPlugin(options: NodeBootstrapResolutionOptions): EcoBuildPlugin {
	return {
		name: 'node-bootstrap-plugin',
		setup(build) {
			build.onResolve({ filter: /^bun:/ }, (args) => {
				throw new Error(getNodeUnsupportedBuiltinError(args.path, args.importer));
			});

			build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (args) => {
				if (!shouldRewriteProjectImportMeta(args.path, options.projectDir)) {
					return undefined;
				}

				const originalContents = readFileSync(args.path, 'utf8');
				const contents = originalContents
					.replaceAll('import.meta.env', 'process.env')
					.replaceAll('import.meta.dirname', JSON.stringify(path.dirname(args.path)))
					.replaceAll('import.meta.filename', JSON.stringify(args.path))
					.replaceAll('import.meta.dir', JSON.stringify(path.dirname(args.path)))
					.replaceAll('import.meta.path', JSON.stringify(args.path));

				if (contents === originalContents) {
					return undefined;
				}

				return {
					contents,
					loader: getLoaderForPath(args.path),
				};
			});

			build.onResolve({ filter: /^[@A-Za-z0-9][^:]*$/ }, (args) => {
				return resolveNodeBootstrapDependency(args, options);
			});
		},
	};
}

/**
 * Creates the default Node bootstrap plugin for one Ecopages app runtime.
 *
 * This binds the shared resolution policy to one Ecopages app runtime.
 */
export function createAppNodeBootstrapPlugin(
	appConfig: Pick<EcoPagesAppConfig, 'rootDir' | 'workDir' | 'absolutePaths'>,
): EcoBuildPlugin {
	return createNodeBootstrapPlugin({
		projectDir: appConfig.rootDir,
		runtimeNodeModulesDir: getAppRuntimeNodeModulesDir(appConfig),
	});
}
