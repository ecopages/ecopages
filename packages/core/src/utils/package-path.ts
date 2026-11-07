import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';

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

function findPackagePath(filePath: string): string | undefined {
	let dir = path.dirname(filePath);
	while (true) {
		const identity = readPackageIdentity(path.join(dir, 'package.json'));
		if (identity) {
			const subpath = path.relative(dir, filePath).split(path.sep).join('/');
			return `${identity.name}${identity.version ? `@${identity.version}` : ''}/${subpath}`;
		}
		const parent = path.dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
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
