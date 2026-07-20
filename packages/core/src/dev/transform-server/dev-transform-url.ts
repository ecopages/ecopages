import path from 'node:path';

import { DEV_TRANSFORM_URL_PREFIX } from '../../hmr/hmr-asset-paths.ts';
import { encodeHmrDynamicSegments } from '../../hmr/hmr-entrypoint-output.ts';

export { DEV_TRANSFORM_URL_PREFIX } from '../../hmr/hmr-asset-paths.ts';

/**
 * Maps a source entrypoint to the browser URL served by the dev transform server.
 */
export function resolveDevTransformModuleUrl(srcDir: string, entrypointPath: string): string {
	const resolvedSrcDir = path.resolve(srcDir);
	const normalizedEntrypoint = path.resolve(entrypointPath);
	const relativePath = path.relative(resolvedSrcDir, normalizedEntrypoint);
	if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
		throw new Error(`[dev-transform] Entrypoint must be under srcDir: ${entrypointPath}`);
	}

	const relativePathJs = relativePath.replace(/\.(tsx?|jsx?|mdx?)$/, '.js');
	const encodedPathJs = encodeHmrDynamicSegments(relativePathJs);
	const urlPath = encodedPathJs.split(path.sep).join('/');

	return `${DEV_TRANSFORM_URL_PREFIX}/${urlPath}`;
}
