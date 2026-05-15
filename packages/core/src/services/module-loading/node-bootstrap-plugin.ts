import path from 'node:path';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
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

function pathEntryExists(filePath: string): boolean {
	try {
		lstatSync(filePath);
		return true;
	} catch {
		return false;
	}
}

function linkPointsToPackage(linkPath: string, packageRoot: string): boolean {
	try {
		return realpathSync(linkPath) === realpathSync(packageRoot);
	} catch {
		return false;
	}
}

function ensureRuntimePackageLink(nodeModulesDir: string, specifier: string, resolvedPath: string): void {
	const packageName = getPackageNameFromSpecifier(specifier);
	const packageRoot = findPackageRoot(resolvedPath);
	const linkPath = path.join(nodeModulesDir, packageName);

	mkdirSync(path.dirname(linkPath), { recursive: true });

	if (pathEntryExists(linkPath)) {
		if (linkPointsToPackage(linkPath, packageRoot)) {
			return;
		}

		removeRuntimePackageLink(linkPath);
	}

	try {
		symlinkSync(packageRoot, linkPath, 'dir');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
			throw error;
		}

		if (linkPointsToPackage(linkPath, packageRoot)) {
			return;
		}

		removeRuntimePackageLink(linkPath);
		symlinkSync(packageRoot, linkPath, 'dir');
	}
}

function removeRuntimePackageLink(linkPath: string): void {
	try {
		const stats = lstatSync(linkPath);
		if (stats.isSymbolicLink()) {
			unlinkSync(linkPath);
			return;
		}
	} catch {
		return;
	}

	rmSync(linkPath, { recursive: true, force: true });
}

export interface NodeBootstrapResolutionOptions {
	/**
	 * App root used as the fallback package boundary when an importer does not
	 * live under a more specific package.json.
	 */
	projectDir: string;
	/**
	 * Runtime-local node_modules directory that receives symlinks to resolved
	 * package roots so transpiled Node imports share one package graph.
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
					ensureRuntimePackageLink(options.runtimeNodeModulesDir, args.path, candidatePackageJson);
					return { path: args.path, external: true };
				}
			}
		}

		if (!resolvedPath) {
			return undefined;
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

/**
 * Creates the Node bootstrap plugin used by app-owned server module loads.
 *
 * The resolver anchors third-party imports to the nearest package boundary for
 * the importing file, then mirrors the resolved package root into the runtime
 * node_modules directory. That keeps transpiled Node execution aligned with the
 * package graph each source file was authored against.
 */
export function createNodeBootstrapPlugin(options: NodeBootstrapResolutionOptions): EcoBuildPlugin {
	const projectDir = path.resolve(options.projectDir);

	return {
		name: 'node-bootstrap-plugin',
		setup(build) {
			build.onResolve({ filter: /^bun:/ }, (args) => {
				throw new Error(getNodeUnsupportedBuiltinError(args.path, args.importer));
			});

			build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
				const absolutePath = path.resolve(args.path);
				const shouldRewriteImportMeta = shouldRewriteBootstrapSource(absolutePath, projectDir);

				if (!shouldRewriteImportMeta) {
					return undefined;
				}

				const originalContents = readFileSync(args.path, 'utf8');
				const contents = originalContents
					.replaceAll('import.meta.dirname', JSON.stringify(path.dirname(args.path)))
					.replaceAll('import.meta.filename', JSON.stringify(args.path));

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

/**
 * Creates the default Node bootstrap plugin for one Ecopages app runtime.
 *
 * This binds the shared resolution policy to the app's internal execution
 * directory so transpiled server modules can externalize packages into one
 * stable runtime node_modules graph.
 */
export function createAppNodeBootstrapPlugin(
	appConfig: Pick<EcoPagesAppConfig, 'rootDir' | 'workDir' | 'absolutePaths'>,
): EcoBuildPlugin {
	return createNodeBootstrapPlugin({
		projectDir: appConfig.rootDir,
		runtimeNodeModulesDir: getAppRuntimeNodeModulesDir(appConfig),
	});
}
