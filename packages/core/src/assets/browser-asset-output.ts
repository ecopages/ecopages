import path from 'node:path';
import { isPathInside } from '../utils/path-containment.ts';

/**
 * Source-relative path of a file inside `srcDir`.
 *
 * @remarks
 * `path.relative` from `srcDir` to a file outside it starts with `..`. Joining
 * that onto `dist` writes the asset outside the build. Callers then emit the file
 * in `dist/client/assets`: a bundled script under the bundler's `[name]-[hash]` name, and
 * an unbundled script or stylesheet under a content hash.
 */
export function sourceRelativeBrowserAssetPath(srcDir: string, filepath: string): string | undefined {
	if (!isPathInside(filepath, srcDir)) return undefined;

	const relativePath = path.relative(srcDir, filepath);
	return relativePath === '' ? undefined : relativePath;
}

/**
 * Throws when a browser output is not inside `distDir`.
 *
 * @remarks
 * The public URL and the gzip pass already skip a file outside `dist`. A write
 * that appends a source-relative path uses the same check, so the file is not
 * created there either.
 */
export function assertBrowserOutputInsideDist(distDir: string, outputPath: string): void {
	if (!isPathInside(outputPath, distDir)) {
		throw new Error(`Refusing to write ${outputPath} outside ${distDir}`);
	}
}
