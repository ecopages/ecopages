import path from 'node:path';

import { fileSystem } from '@ecopages/file-system';
import { DEV_TRANSFORM_URL_PREFIX, stripModuleUrlQuery } from '../../hmr/hmr-asset-paths.ts';
import { decodeHmrDynamicSegments, encodeHmrDynamicSegments } from '../../hmr/hmr-entrypoint-output.ts';
import { isPathInside } from '../../utils/path-containment.ts';
import { resolveDevTransformModuleKind } from './dev-transform-module-kind.ts';

export { DEV_TRANSFORM_URL_PREFIX } from '../../hmr/hmr-asset-paths.ts';

const PAGE_SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mdx', '.md'] as const;
const FS_URL_SEGMENT = '@fs';

function toDevTransformUrlPath(relativeOrAbsolutePath: string): string {
	const relativePathJs = relativeOrAbsolutePath.replace(/\.(tsx?|jsx?|mdx?)$/, '.js');
	return encodeHmrDynamicSegments(relativePathJs).split(path.sep).join('/');
}

function isInsideAllowedRoot(filePath: string, allowedRoots: readonly string[]): boolean {
	return allowedRoots.some((root) => isPathInside(filePath, root));
}

/**
 * Maps a source entrypoint to the browser URL served by the dev transform server.
 *
 * @remarks
 * Files under `srcDir` keep path-relative URLs. Files in `extraRoots` (workspace
 * packages) use `/assets/__eco_dev__/@fs/...` so an island outside the app folder
 * can still hydrate.
 */
export function resolveDevTransformModuleUrl(
	srcDir: string,
	entrypointPath: string,
	extraRoots: readonly string[] = [],
): string {
	const resolvedSrcDir = path.resolve(srcDir);
	const normalizedEntrypoint = path.resolve(entrypointPath);
	const relativePath = path.relative(resolvedSrcDir, normalizedEntrypoint);
	if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
		return `${DEV_TRANSFORM_URL_PREFIX}/${toDevTransformUrlPath(relativePath)}`;
	}

	const allowedRoots = [resolvedSrcDir, ...extraRoots.map((root) => path.resolve(root))];
	if (!isInsideAllowedRoot(normalizedEntrypoint, allowedRoots)) {
		throw new Error(`[dev-transform] Entrypoint must be under srcDir or a workspace package: ${entrypointPath}`);
	}

	const fsPath = toDevTransformUrlPath(normalizedEntrypoint).replace(/^\//, '');
	return `${DEV_TRANSFORM_URL_PREFIX}/${FS_URL_SEGMENT}/${fsPath}`;
}

function resolveExistingModuleFile(jsPath: string, allowedRoots: readonly string[]): string | undefined {
	if (resolveDevTransformModuleKind(jsPath) === 'stylesheet') {
		if (isInsideAllowedRoot(jsPath, allowedRoots) && fileSystem.exists(jsPath)) {
			return jsPath;
		}
		return undefined;
	}

	const basePath = jsPath.replace(/\.js$/u, '');
	for (const extension of PAGE_SOURCE_EXTENSIONS) {
		const candidate = `${basePath}${extension}`;
		if (!isInsideAllowedRoot(candidate, allowedRoots)) {
			continue;
		}
		if (fileSystem.exists(candidate)) {
			return candidate;
		}
	}

	return undefined;
}

/**
 * Resolves a dev-transform browser URL back to an on-disk page entrypoint.
 *
 * @remarks
 * Client-side navigation can request page modules that were not registered during
 * the current SSR response. Lazy resolution keeps those URLs materializable on demand.
 */
export function resolveDevTransformModuleSourcePath(
	srcDir: string,
	moduleUrl: string,
	extraRoots: readonly string[] = [],
): string | undefined {
	const pathname = stripModuleUrlQuery(moduleUrl);
	const prefix = `${DEV_TRANSFORM_URL_PREFIX}/`;
	if (!pathname.startsWith(prefix)) {
		return undefined;
	}

	const resolvedSrcDir = path.resolve(srcDir);
	const allowedRoots = [resolvedSrcDir, ...extraRoots.map((root) => path.resolve(root))];
	const relativeUrlPath = pathname.slice(prefix.length);
	const fsPrefix = `${FS_URL_SEGMENT}/`;

	if (relativeUrlPath.startsWith(fsPrefix)) {
		const absoluteJsPath = path.resolve(`/${decodeHmrDynamicSegments(relativeUrlPath.slice(fsPrefix.length))}`);
		return resolveExistingModuleFile(absoluteJsPath, allowedRoots);
	}

	const relativePathJs = relativeUrlPath.split('/').join(path.sep);
	const decodedRelativePathJs = decodeHmrDynamicSegments(relativePathJs);
	return resolveExistingModuleFile(path.resolve(resolvedSrcDir, decodedRelativePathJs), allowedRoots);
}
