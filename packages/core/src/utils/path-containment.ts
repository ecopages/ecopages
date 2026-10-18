import path from 'node:path';

function getRelativePath(filePath: string, directory: string): string {
	return path.relative(path.resolve(directory), path.resolve(filePath));
}

function isRelativePathInside(relativePath: string): boolean {
	return relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}

/**
 * Returns whether `filePath` is `directory` itself or a path inside it.
 *
 * @remarks
 * A bare `startsWith` prefix check also matches siblings such as `src/public-api` for `src/public`. The
 * comparison is on resolved path strings only; symlinks are not followed.
 */
export function isPathInside(filePath: string, directory: string): boolean {
	return isRelativePathInside(getRelativePath(filePath, directory));
}

/**
 * Returns whether `filePath` is a descendant of `directory`, excluding the directory itself.
 *
 * @remarks
 * Compares resolved path strings; symlinks are not followed.
 */
export function isPathStrictlyInside(filePath: string, directory: string): boolean {
	const relativePath = getRelativePath(filePath, directory);
	return relativePath !== '' && isRelativePathInside(relativePath);
}
