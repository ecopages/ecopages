import path from 'node:path';

/**
 * Returns `filePath` relative to `rootDir` with POSIX separators.
 */
export function toRootRelativePath(rootDir: string, filePath: string): string {
	const absolute = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(rootDir, filePath);
	return path.relative(rootDir, absolute).split(path.sep).join('/');
}
