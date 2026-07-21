import path from 'node:path';

import { fileSystem } from '@ecopages/file-system';
import { DEV_TRANSFORM_URL_PREFIX, stripModuleUrlQuery } from '../../hmr/hmr-asset-paths.ts';
import { decodeHmrDynamicSegments, encodeHmrDynamicSegments } from '../../hmr/hmr-entrypoint-output.ts';

export { DEV_TRANSFORM_URL_PREFIX } from '../../hmr/hmr-asset-paths.ts';

const PAGE_SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mdx', '.md'] as const;

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

/**
 * Resolves a dev-transform browser URL back to an on-disk page entrypoint.
 *
 * @remarks
 * Client-side navigation can request page modules that were not registered during
 * the current SSR response. Lazy resolution keeps those URLs materializable on demand.
 */
export function resolveDevTransformModuleSourcePath(srcDir: string, moduleUrl: string): string | undefined {
	const pathname = stripModuleUrlQuery(moduleUrl);
	const prefix = `${DEV_TRANSFORM_URL_PREFIX}/`;
	if (!pathname.startsWith(prefix)) {
		return undefined;
	}

	const resolvedSrcDir = path.resolve(srcDir);
	const relativeUrlPath = pathname.slice(prefix.length);
	const relativePathJs = relativeUrlPath.split('/').join(path.sep);
	const decodedRelativePathJs = decodeHmrDynamicSegments(relativePathJs);

	if (decodedRelativePathJs.endsWith('.css')) {
		const cssPath = path.resolve(resolvedSrcDir, decodedRelativePathJs);
		if (cssPath.startsWith(`${resolvedSrcDir}${path.sep}`) && fileSystem.exists(cssPath)) {
			return cssPath;
		}
		return undefined;
	}

	const basePath = decodedRelativePathJs.replace(/\.js$/u, '');

	for (const extension of PAGE_SOURCE_EXTENSIONS) {
		const candidate = path.resolve(resolvedSrcDir, `${basePath}${extension}`);
		if (!candidate.startsWith(`${resolvedSrcDir}${path.sep}`)) {
			continue;
		}
		if (fileSystem.exists(candidate)) {
			return candidate;
		}
	}

	return undefined;
}
