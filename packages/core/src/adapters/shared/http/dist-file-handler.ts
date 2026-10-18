import { STATUS_MESSAGE } from '../../../constants.ts';
import { appLogger } from '../../../global/app-logger.ts';
import { fileSystem } from '@ecopages/file-system';
import path from 'node:path';
import {
	HASHED_BROWSER_ASSET_INDEX_FILENAME,
	hashBrowserAssetBytes,
	isHashedBrowserAsset,
} from '../../../assets/hashed-browser-asset.ts';
import { ServerUtils } from '../../../utils/server-utils.module.ts';

export type ServeDistFileOptions = {
	distDir: string;
	watchMode: boolean;
	resolveExportedPages?: boolean;
	staticFilesOnly?: boolean;
	notFound?: (request: Request) => Response | Promise<Response>;
};

/**
 * Serves one request from an application's emitted `dist` directory.
 *
 * @remarks
 * The runtime fallback and static preview share path validation, file lookup, cache headers, ETags, and gzip
 * negotiation. Callers provide their own 404 so runtime requests can render an error Page while preview reads
 * the exported `404.html`.
 */
export async function serveDistFile(request: Request, options: ServeDistFileOptions): Promise<Response> {
	const method = request.method.toUpperCase();
	if (method !== 'GET' && method !== 'HEAD') {
		return new Response(method === 'HEAD' ? null : 'Method Not Allowed', {
			status: 405,
			headers: { Allow: 'GET, HEAD', 'Content-Type': 'text/plain' },
		});
	}

	let pathname: string;
	try {
		pathname = decodeURIComponent(new URL(request.url).pathname);
	} catch {
		return createBadRequestResponse(method);
	}

	const distDir = path.resolve(options.distDir);
	const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
	const requestedPath = path.resolve(distDir, relativePath);
	if (!isPathInside(distDir, requestedPath)) {
		return createBadRequestResponse(method);
	}
	if (options.staticFilesOnly && !ServerUtils.hasKnownStaticExtension(pathname)) {
		return await createNotFoundResponse(request, options, distDir, method);
	}

	const candidate = options.resolveExportedPages
		? ServerUtils.resolveStaticFilePath(requestedPath)
		: fileSystem.exists(requestedPath) && !fileSystem.isDirectory(requestedPath)
			? requestedPath
			: undefined;

	if (!candidate || path.basename(candidate) === HASHED_BROWSER_ASSET_INDEX_FILENAME) {
		return await createNotFoundResponse(request, options, distDir, method);
	}

	const response = await createDistFileResponse(candidate, ServerUtils.getContentType(candidate), request, options.watchMode);
	if (!response) {
		return await createNotFoundResponse(request, options, distDir, method);
	}

	return method === 'HEAD' ? responseWithoutBody(response) : response;
}

async function createNotFoundResponse(
	request: Request,
	options: ServeDistFileOptions,
	distDir: string,
	method: string,
): Promise<Response> {
	const response = options.notFound
		? await options.notFound(request)
		: await createDistNotFoundResponse(request, distDir);
	return method === 'HEAD' ? responseWithoutBody(response) : response;
}

function isPathInside(root: string, candidate: string): boolean {
	const relativePath = path.relative(root, candidate);
	return relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}

function createBadRequestResponse(method: string): Response {
	return new Response(method === 'HEAD' ? null : 'Invalid path', {
		status: 400,
		headers: { 'Content-Type': 'text/plain' },
	});
}

async function createDistNotFoundResponse(request: Request, distDir: string): Promise<Response> {
	const notFoundPath = path.join(distDir, '404.html');
	if (fileSystem.exists(notFoundPath) && !fileSystem.isDirectory(notFoundPath)) {
		const body = request.method === 'HEAD' ? null : fileSystem.readFileAsBuffer(notFoundPath);
		return new Response(body as unknown as BodyInit | null, {
			status: 404,
			headers: { 'Content-Type': 'text/html' },
		});
	}

	return new Response(request.method === 'HEAD' ? null : STATUS_MESSAGE[404], {
		status: 404,
		headers: { 'Content-Type': 'text/plain' },
	});
}

async function createDistFileResponse(
	filePath: string,
	contentType: string,
	request: Request,
	watchMode: boolean,
): Promise<Response | null> {
	try {
		const gzipPath = `${filePath}.gz`;
		const gzipEligible = !watchMode && (contentType === 'text/javascript' || contentType === 'text/css');
		const hasGzipVariant = gzipEligible && fileSystem.exists(gzipPath);
		const useGzip = hasGzipVariant && acceptsGzip(request.headers.get('Accept-Encoding'));
		const file = fileSystem.readFileAsBuffer(useGzip ? gzipPath : filePath);
		const cacheHeaders = fileCacheHeaders(filePath, file, watchMode);
		const headers = new Headers({
			'Content-Type': contentType,
			...cacheHeaders,
			...(useGzip ? { 'Content-Encoding': 'gzip' } : {}),
			...(hasGzipVariant ? { Vary: 'Accept-Encoding' } : {}),
		});
		if (matchesIfNoneMatch(request.headers.get('If-None-Match'), cacheHeaders.ETag)) {
			return new Response(null, { status: 304, headers });
		}

		return new Response(file as unknown as BodyInit, { headers });
	} catch (error) {
		const errorDetails = error instanceof Error ? error : new Error(String(error));
		const errorCode = getErrorCode(error);
		if (errorCode === 'ENOENT') {
			appLogger.debug('File not found', filePath);
		} else {
			appLogger.error('Error reading file', filePath, errorDetails);
		}
		return null;
	}
}

function getErrorCode(error: unknown): string | undefined {
	if (typeof error !== 'object' || error === null) return undefined;
	const maybeError = error as { code?: unknown; cause?: unknown };
	if (typeof maybeError.code === 'string') return maybeError.code;
	if (typeof maybeError.cause === 'object' && maybeError.cause !== null) {
		const causeCode = (maybeError.cause as { code?: unknown }).code;
		if (typeof causeCode === 'string') return causeCode;
	}
	return undefined;
}

function responseWithoutBody(response: Response): Response {
	return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
}

function fileCacheHeaders(filePath: string, file: Buffer, watchMode: boolean): Record<string, string> & { ETag: string } {
	const etag = `"${hashBrowserAssetBytes(file)}"`;
	const extension = path.extname(filePath).toLowerCase();
	if (extension === '.html') {
		return { 'Cache-Control': 'public, max-age=0, must-revalidate', ETag: etag };
	}

	if (watchMode) {
		return { 'Cache-Control': 'no-cache', ETag: etag };
	}

	if (isHashedBrowserAsset(filePath)) {
		return { 'Cache-Control': 'public, max-age=31536000, immutable', ETag: etag };
	}

	return { 'Cache-Control': 'public, max-age=0, must-revalidate', ETag: etag };
}

function acceptsGzip(acceptEncoding: string | null): boolean {
	const encodings = (acceptEncoding ?? '').split(',').map((value) => {
		const [encoding, ...parameters] = value.trim().toLowerCase().split(';');
		const quality = parameters
			.find((parameter) => parameter.trim().startsWith('q='))
			?.trim()
			.slice(2);
		return { encoding, quality };
	});
	const explicitGzip = encodings.find(({ encoding }) => encoding === 'gzip');
	const selectedEncoding = explicitGzip ?? encodings.find(({ encoding }) => encoding === '*');
	return (
		selectedEncoding !== undefined &&
		(selectedEncoding.quality === undefined || Number(selectedEncoding.quality) > 0)
	);
}

function matchesIfNoneMatch(ifNoneMatch: string | null, etag: string): boolean {
	if (!ifNoneMatch) return false;
	return ifNoneMatch.split(',').some((value) => {
		const candidate = value.trim();
		return candidate === '*' || candidate === etag || candidate === `W/${etag}`;
	});
}
