import path from 'node:path';

/**
 * Public URL of an optimized file written under the output directory.
 *
 * @param outputPath - Native filesystem path of the written file.
 * @remarks
 * Joins with `/` on every platform: `path.join` would give a backslash URL on Windows. Kept apart from
 * `image-utils.ts`, which client code imports and so cannot use `node:path`.
 */
export function toPublicImageSrc(publicPath: string, outputPath: string): string {
	return path.posix.join(publicPath, path.basename(outputPath));
}
