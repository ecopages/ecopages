import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';

function readPackageName(packageJsonPath: string): string | undefined {
	try {
		const name = (JSON.parse(fileSystem.readFileSync(packageJsonPath)) as { name?: unknown }).name;
		return typeof name === 'string' && name.length > 0 ? name : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Names a file inside an installed package as `<package name>/<path inside the package>`, such as
 * `some-lib/css/style.css`, or returns `undefined` when no named `package.json` contains it.
 *
 * @remarks
 * The nearest `package.json` with a `name` is the package root, so a nested one without a name, such as
 * `dist/esm/package.json`, is skipped. The result does not depend on where the package is installed: under
 * pnpm a store path such as `.pnpm/some-lib@1.2.0/node_modules/some-lib` names the same file before and after
 * a version bump. {@link resolvePackagePath} finds the file again.
 */
export function toPackagePath(filePath: string): string | undefined {
	let dir = path.dirname(filePath);
	while (true) {
		const name = readPackageName(path.join(dir, 'package.json'));
		if (name) return `${name}/${path.relative(dir, filePath).split(path.sep).join('/')}`;
		const parent = path.dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

function splitPackagePath(packagePath: string): { name: string; subpath: string } {
	const segments = packagePath.split('/');
	const nameLength = packagePath.startsWith('@') ? 2 : 1;
	return { name: segments.slice(0, nameLength).join('/'), subpath: segments.slice(nameLength).join('/') };
}

/**
 * Resolves a path {@link toPackagePath} returned to the real path of that file in the package installed for
 * `rootDir`.
 *
 * @remarks
 * Looks for `node_modules/<package name>` in `rootDir` and each folder above it, as Node does. When no folder
 * holds the package, it returns the path the package would have in `rootDir/node_modules`: a sealed
 * `ecopages start` keys the file by its package path and never reads it, so a deploy without the package still
 * serves the file the build recorded.
 */
export function resolvePackagePath(rootDir: string, packagePath: string): string {
	const { name, subpath } = splitPackagePath(packagePath);
	let dir = path.resolve(rootDir);
	while (true) {
		const packageDir = path.join(dir, 'node_modules', ...name.split('/'));
		if (fileSystem.exists(path.join(packageDir, 'package.json'))) {
			return path.join(fileSystem.realpath(packageDir), ...subpath.split('/'));
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return path.join(path.resolve(rootDir), 'node_modules', ...name.split('/'), ...subpath.split('/'));
}
