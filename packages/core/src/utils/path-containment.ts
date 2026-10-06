import path from 'node:path';

/**
 * Returns whether `filePath` is `directory` itself or a path inside it.
 *
 * @remarks
 * A bare `startsWith` prefix check also matches siblings such as `src/public-api` for `src/public`. The
 * comparison is on resolved path strings only; symlinks are not followed.
 */
export function isPathInside(filePath: string, directory: string): boolean {
	const relativePath = path.relative(path.resolve(directory), path.resolve(filePath));
	return relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}
