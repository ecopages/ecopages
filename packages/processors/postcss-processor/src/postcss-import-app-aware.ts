/// <reference path="./postcss-import-resolve-id.d.ts" />
import { fileSystem } from '@ecopages/file-system';
import { createRequire } from 'node:module';
import { path } from '@ecopages/file-system/path';
import type postcss from 'postcss';
import postcssImportDefault from 'postcss-import';
import type postcssImport from 'postcss-import';
import resolveImportIdDefault from 'postcss-import/lib/resolve-id.js';

type PostcssImportOptions = NonNullable<Parameters<typeof postcssImport>[0]>;
type ResolveImportId = (id: string, base: string, options: PostcssImportOptions, node: unknown) => Promise<string>;
type PackageJson = {
	style?: string;
	main?: string;
	exports?: Record<string, string | { style?: string; import?: string; require?: string; default?: string }>;
};

/**
 * Finds the nearest directory containing a package.json by walking up from a file path.
 * Falls back to `process.cwd()` when no package.json is found.
 */
export function resolveAppRootFromPath(filePath: string): string {
	let dir = path.dirname(path.resolve(filePath));
	const filesystemRoot = path.parse(dir).root;

	while (dir !== filesystemRoot) {
		if (fileSystem.exists(path.join(dir, 'package.json'))) {
			return dir;
		}

		const parent = path.dirname(dir);
		if (parent === dir) {
			break;
		}
		dir = parent;
	}

	return path.cwd();
}

function loadPostcssImport(requireFromApp: NodeRequire): typeof postcssImportDefault {
	try {
		return requireFromApp('postcss-import') as typeof postcssImportDefault;
	} catch {
		return postcssImportDefault;
	}
}

/**
 * @remarks
 * The fallback is imported statically: a server bundle that inlines this module keeps the import, where a
 * `require` relative to this module would resolve from the bundle's folder.
 */
function loadResolveImportId(requireFromApp: NodeRequire): ResolveImportId {
	try {
		return requireFromApp('postcss-import/lib/resolve-id') as ResolveImportId;
	} catch {
		return resolveImportIdDefault;
	}
}

function splitPackageSpecifier(id: string): { packageName: string; subpath: string } {
	if (id.startsWith('@')) {
		const [scope, name, ...rest] = id.split('/');
		return {
			packageName: `${scope}/${name}`,
			subpath: rest.join('/'),
		};
	}

	const [packageName, ...rest] = id.split('/');
	return { packageName, subpath: rest.join('/') };
}

function resolveExportTarget(pkg: PackageJson, packageDir: string, subpath: string): string | null {
	const exports = pkg.exports;
	if (!exports) {
		return null;
	}

	const keys = [`./${subpath}`, `./${subpath.replace(/\.css$/, '')}`];
	for (const key of keys) {
		const entry = exports[key];
		if (!entry) {
			continue;
		}

		const target =
			typeof entry === 'string' ? entry : (entry.style ?? entry.import ?? entry.require ?? entry.default);
		if (!target) {
			continue;
		}

		const resolved = path.join(packageDir, target);
		if (fileSystem.exists(resolved)) {
			return resolved;
		}
	}

	return null;
}

function findPackageDirFromNodeModules(packageName: string, appRoot: string): string | null {
	let dir = path.resolve(appRoot);
	const filesystemRoot = path.parse(dir).root;

	while (true) {
		const candidate = path.join(dir, 'node_modules', packageName, 'package.json');
		if (fileSystem.exists(candidate)) {
			return path.dirname(candidate);
		}

		if (dir === filesystemRoot) {
			break;
		}

		const parent = path.dirname(dir);
		if (parent === dir) {
			break;
		}
		dir = parent;
	}

	return null;
}

function resolveBarePackageImport(id: string, appRoot: string): string {
	const { packageName, subpath } = splitPackageSpecifier(id);
	const packageDir = findPackageDirFromNodeModules(packageName, appRoot);
	if (!packageDir) {
		throw new Error(`Unable to locate package "${packageName}" from "${appRoot}"`);
	}
	const packageJsonPath = path.join(packageDir, 'package.json');
	const pkg = JSON.parse(fileSystem.readFileSync(packageJsonPath)) as PackageJson;

	if (subpath) {
		const directPath = path.join(packageDir, subpath);
		if (fileSystem.exists(directPath)) {
			return directPath;
		}

		const exportPath = resolveExportTarget(pkg, packageDir, subpath);
		if (exportPath) {
			return exportPath;
		}

		throw new Error(`Unable to resolve "${id}"`);
	}

	if (pkg.style) {
		const stylePath = path.join(packageDir, pkg.style);
		if (fileSystem.exists(stylePath)) {
			return stylePath;
		}
	}

	const indexCssPath = path.join(packageDir, 'index.css');
	if (fileSystem.exists(indexCssPath)) {
		return indexCssPath;
	}

	if (pkg.main && /\.css$/.test(pkg.main)) {
		const mainPath = path.join(packageDir, pkg.main);
		if (fileSystem.exists(mainPath)) {
			return mainPath;
		}
	}

	throw new Error(`Unable to resolve CSS entry for package "${id}"`);
}

/**
 * Creates a postcss-import instance that resolves bare package imports from the app root.
 */
export function createAppAwarePostcssImport(appRoot: string): postcss.AcceptedPlugin {
	const requireFromApp = createRequire(path.join(appRoot, 'package.json'));
	const postcssImport = loadPostcssImport(requireFromApp);
	const resolveImportId = loadResolveImportId(requireFromApp);

	const resolve: ResolveImportId = (id, base, options, node) => {
		return resolveImportId(id, base, options, node).catch((error: unknown) => {
			if (id.startsWith('.') || path.isAbsolute(id)) {
				throw error;
			}

			try {
				return resolveBarePackageImport(id, appRoot);
			} catch {
				throw error;
			}
		});
	};

	return postcssImport({
		root: appRoot,
		resolve: resolve as unknown as NonNullable<PostcssImportOptions['resolve']>,
	});
}
