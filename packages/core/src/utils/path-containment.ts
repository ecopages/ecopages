import { path } from '@ecopages/file-system/path';

/**
 * Returns whether `filePath` is `directory` itself or a path inside it.
 *
 * @remarks
 * A bare `startsWith` prefix check also matches siblings such as `src/public-api` for `src/public`. The
 * comparison is on resolved path strings only; symlinks are not followed.
 */
export function isPathInside(filePath: string, directory: string): boolean {
	return path.isWithin(directory, filePath);
}

/**
 * Returns whether `filePath` is a descendant of `directory`, excluding the directory itself.
 *
 * @remarks
 * Compares resolved path strings; symlinks are not followed.
 */
export function isPathStrictlyInside(filePath: string, directory: string): boolean {
	return path.isWithin(directory, filePath) && path.relative(directory, filePath) !== '';
}
