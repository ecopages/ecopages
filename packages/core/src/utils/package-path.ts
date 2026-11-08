import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import { isPathInside } from './path-containment.ts';

function readPackageIdentity(packageJsonPath: string): { name: string; version?: string } | undefined {
	try {
		const { name, version } = JSON.parse(fileSystem.readFileSync(packageJsonPath)) as {
			name?: unknown;
			version?: unknown;
		};
		if (typeof name !== 'string' || name.length === 0) return undefined;
		return typeof version === 'string' && version.length > 0 ? { name, version } : { name };
	} catch {
		return undefined;
	}
}

/**
 * Names a file inside an installed package as `<name>@<version>/<path inside the package>`, such as
 * `some-lib@1.2.0/css/style.css`, or returns `undefined` when no named `package.json` contains it.
 *
 * @remarks
 * The nearest `package.json` with a `name` is the package root, so a nested one without a name, such as
 * `dist/esm/package.json`, is skipped; a package without a `version` is named `<name>/<path>`. The result does
 * not depend on where the package is installed, so it survives a moved build or another store layout, and two
 * versions of one package name two files. {@link resolvePackagePath} finds the file again.
 */
export function toPackagePath(filePath: string): string | undefined {
	if (packagePathCache.has(filePath)) return packagePathCache.get(filePath);
	const packagePath = findPackagePath(filePath);
	packagePathCache.set(filePath, packagePath);
	return packagePath;
}

/**
 * @remarks
 * Dependency keys name node-module scripts by package path on every request, so each file is looked up once per
 * process; a reinstall moves a package to a new real path, which is looked up afresh.
 */
const packagePathCache = new Map<string, string | undefined>();

/** The folder of the nearest `package.json` with a `name` above `filePath`, or `undefined` outside any package. */
export function findPackageRoot(filePath: string): string | undefined {
	let dir = path.dirname(filePath);
	while (true) {
		if (readPackageIdentity(path.join(dir, 'package.json'))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

function findPackagePath(filePath: string): string | undefined {
	const dir = findPackageRoot(filePath);
	if (!dir) return undefined;
	const identity = readPackageIdentity(path.join(dir, 'package.json'))!;
	return `${identity.name}${identity.version ? `@${identity.version}` : ''}/${path.relative(dir, filePath)}`;
}

/** Splits a {@link toPackagePath} result into the package name and the path inside the package. */
export function splitPackagePath(packagePath: string): { name: string; subpath: string } {
	const segments = packagePath.split('/');
	const nameLength = packagePath.startsWith('@') ? 2 : 1;
	const name = segments.slice(0, nameLength).join('/');
	const versionAt = name.indexOf('@', 1);
	return {
		name: versionAt === -1 ? name : name.slice(0, versionAt),
		subpath: segments.slice(nameLength).join('/'),
	};
}

/**
 * Resolves a path {@link toPackagePath} returned to the real path of that file in the package installed for
 * `fromDir`, the folder of the module that imported it.
 *
 * @remarks
 * Looks for `node_modules/<package name>` in `fromDir` and each folder above it, as Node does, so a linked
 * workspace package reaches its own dependencies. When no folder holds the package, it returns the path the
 * package would have in `fromDir/node_modules`: a sealed `ecopages start` keys the file by its package path and
 * never reads it, so a deploy without the package still serves the file the build recorded.
 */
export function resolvePackagePath(fromDir: string, packagePath: string): string {
	const { name, subpath } = splitPackagePath(packagePath);
	let dir = path.resolve(fromDir);
	while (true) {
		const packageDir = path.join(dir, 'node_modules', ...name.split('/'));
		if (fileSystem.exists(path.join(packageDir, 'package.json'))) {
			return path.join(fileSystem.realpath(packageDir), ...subpath.split('/'));
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return path.join(path.resolve(fromDir), 'node_modules', ...name.split('/'), ...subpath.split('/'));
}

/**
 * The file a stylesheet of an installed package stands for when its CSS Module class names are scoped, or
 * `undefined` for a file of the app.
 *
 * @remarks
 * A scoping Processor derives a class name from the path of the stylesheet relative to the app root, which for a
 * package file includes the store folder, the version folder or the sibling folder of a linked workspace package. This returns
 * `<rootDir>/node_modules/<package name>/<path inside the package>` for a file under `node_modules` or outside
 * `rootDir`, so the names depend on the package name and the path inside it alone, across machines, folders and
 * package-manager layouts, and not on the version. A file outside any named package has no such identity and is
 * scoped by its own path. The file does not have to exist: read the stylesheet from the real path.
 */
export function toPackageScopeFile(file: string, rootDir: string): string | undefined {
	const app = fileSystem.exists(rootDir) ? fileSystem.realpath(rootDir) : rootDir;
	if (!file.split('/').includes('node_modules') && isPathInside(file, app)) return undefined;
	const packagePath = toPackagePath(file);
	if (!packagePath) return undefined;
	const { name, subpath } = splitPackagePath(packagePath);
	return path.join(app, 'node_modules', ...name.split('/'), ...subpath.split('/'));
}
