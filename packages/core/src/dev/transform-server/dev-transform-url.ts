import path from 'node:path';
import { RESOLVED_ASSETS_DIR } from '../../config/constants.ts';
import { encodeHmrDynamicSegments } from '../../hmr/hmr-entrypoint-output.ts';

export const DEV_TRANSFORM_URL_PREFIX = `/${RESOLVED_ASSETS_DIR}/__eco_dev__`;

/**
 * Maps a source entrypoint to the browser URL served by the dev transform server.
 */
export function resolveDevTransformModuleUrl(srcDir: string, entrypointPath: string): string {
	const normalizedEntrypoint = path.resolve(entrypointPath);
	const relativePath = path.relative(srcDir, normalizedEntrypoint);
	const relativePathJs = relativePath.replace(/\.(tsx?|jsx?|mdx?)$/, '.js');
	const encodedPathJs = encodeHmrDynamicSegments(relativePathJs);
	const urlPath = encodedPathJs.split(path.sep).join('/');

	return `${DEV_TRANSFORM_URL_PREFIX}/${urlPath}`;
}

/**
 * Parses a dev transform request pathname back to the on-disk module path.
 */
export function resolveDevTransformSourcePath(srcDir: string, pathname: string): string | undefined {
	const prefix = `${DEV_TRANSFORM_URL_PREFIX}/`;
	if (!pathname.startsWith(prefix)) {
		return undefined;
	}

	const relativeJs = pathname.slice(prefix.length);
	const relativeSource = relativeJs.replace(/\.js$/u, '');
	const decodedRelative = relativeSource.replace(/_([^_/]+)_/g, '[$1]');

	const resolvedSrcDir = path.resolve(srcDir);
	for (const extension of ['.tsx', '.ts', '.jsx', '.js', '.mdx']) {
		const candidate = path.resolve(resolvedSrcDir, `${decodedRelative}${extension}`);
		if (candidate.startsWith(resolvedSrcDir)) {
			return candidate;
		}
	}

	return path.resolve(resolvedSrcDir, `${decodedRelative}.tsx`);
}
