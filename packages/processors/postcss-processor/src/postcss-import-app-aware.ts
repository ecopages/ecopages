import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type postcss from 'postcss';
import postcssImportDefault from 'postcss-import';
import type postcssImport from 'postcss-import';

type PostcssImportOptions = NonNullable<Parameters<typeof postcssImport>[0]>;
type ResolveImportId = (id: string, base: string, options: PostcssImportOptions, node: unknown) => Promise<string>;
type PackageJson = {
	style?: string;
	main?: string;
	exports?: Record<string, string | { style?: string; import?: string; require?: string; default?: string }>;
};

const requireFromProcessor = createRequire(import.meta.url);

/**
 * Finds the nearest directory containing a package.json by walking up from a file path.
 * Falls back to `process.cwd()` when no package.json is found.
 */
export function resolveAppRootFromPath(filePath: string): string {
	let dir = path.dirname(path.resolve(filePath));
	const filesystemRoot = path.parse(dir).root;

	while (dir !== filesystemRoot) {
		if (existsSync(path.join(dir, 'package.json'))) {
			return dir;
		}

		const parent = path.dirname(dir);
		if (parent === dir) {
			break;
		}
		dir = parent;
	}

	return process.cwd();
}

function loadPostcssImport(requireFromApp: NodeRequire): typeof postcssImportDefault {
	try {
		return requireFromApp('postcss-import') as typeof postcssImportDefault;
	} catch {
		return postcssImportDefault;
	}
}

function loadResolveImportId(requireFromApp: NodeRequire): ResolveImportId {
	try {
		return requireFromApp('postcss-import/lib/resolve-id') as ResolveImportId;
	} catch {
		return requireFromProcessor('postcss-import/lib/resolve-id') as ResolveImportId;
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
		if (existsSync(resolved)) {
			return resolved;
		}
	}

	return null;
}

function resolveBarePackageImport(id: string, requireFromApp: NodeRequire): string {
	const { packageName, subpath } = splitPackageSpecifier(id);
	const packageJsonPath = requireFromApp.resolve(`${packageName}/package.json`);
	const packageDir = path.dirname(packageJsonPath);
	const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as PackageJson;

	if (subpath) {
		const directPath = path.join(packageDir, subpath);
		if (existsSync(directPath)) {
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
		if (existsSync(stylePath)) {
			return stylePath;
		}
	}

	const indexCssPath = path.join(packageDir, 'index.css');
	if (existsSync(indexCssPath)) {
		return indexCssPath;
	}

	if (pkg.main && /\.css$/.test(pkg.main)) {
		const mainPath = path.join(packageDir, pkg.main);
		if (existsSync(mainPath)) {
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
				return resolveBarePackageImport(id, requireFromApp);
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
