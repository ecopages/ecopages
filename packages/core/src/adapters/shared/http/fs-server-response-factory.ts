import { STATUS_MESSAGE } from '../../../config/constants.ts';
import { appLogger } from '../../../global/app-logger.ts';
import type { FileSystemServerOptions } from '../../../types/internal-types.ts';
import type { RouteRendererBody } from '../../../types/public-types.ts';
import {
	HASHED_BROWSER_ASSET_INDEX_FILENAME,
	hashBrowserAssetBytes,
	isHashedBrowserAsset,
} from '../../../services/assets/hashed-browser-asset.ts';
import { fileSystem } from '@ecopages/file-system';
import path from 'node:path';

export type FileSystemServerRequestOptions = {
	acceptEncoding?: string | null;
	ifNoneMatch?: string | null;
};

/**
 * Builds HTTP responses for static files and shared file-system fallbacks.
 */
export class FileSystemServerResponseFactory {
	private options: FileSystemServerOptions;

	constructor({ options }: { options: FileSystemServerOptions }) {
		this.options = options;
	}

	shouldEnableGzip(contentType: string) {
		if (this.options.watchMode) return false;
		const gzipEnabledExtensions = ['text/javascript', 'text/css'];
		return gzipEnabledExtensions.includes(contentType);
	}

	async createResponseWithBody(
		body: RouteRendererBody,
		init: ResponseInit = {
			headers: {
				'Content-Type': 'text/html',
			},
		},
	) {
		return new Response(body as BodyInit, init);
	}

	/**
	 * Wraps already-rendered HTML in an error response envelope.
	 */
	async createHtmlErrorResponse(status: number, body: RouteRendererBody) {
		return await this.createResponseWithBody(body, {
			status,
			statusText: STATUS_MESSAGE[status as keyof typeof STATUS_MESSAGE] ?? String(status),
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
			},
		});
	}

	/**
	 * Reads a static file response, returning `null` when the file is missing.
	 */
	async createFileResponse(
		filePath: string,
		contentType: string,
		requestOptions: FileSystemServerRequestOptions = {},
	): Promise<Response | null> {
		if (path.basename(filePath) === HASHED_BROWSER_ASSET_INDEX_FILENAME) return null;

		try {
			const gzipPath = `${filePath}.gz`;
			const hasGzipVariant = this.shouldEnableGzip(contentType) && fileSystem.exists(gzipPath);
			const useGzip = hasGzipVariant && acceptsGzip(requestOptions.acceptEncoding);
			const file = fileSystem.readFileAsBuffer(useGzip ? gzipPath : filePath);
			const cacheHeaders = this.fileCacheHeaders(filePath, file);
			const headers: HeadersInit = {
				'Content-Type': contentType,
				...cacheHeaders,
				...(useGzip ? { 'Content-Encoding': 'gzip' } : {}),
				...(hasGzipVariant ? { Vary: 'Accept-Encoding' } : {}),
			};
			if (matchesIfNoneMatch(requestOptions.ifNoneMatch, cacheHeaders.ETag)) {
				return new Response(null, { status: 304, headers });
			}

			return await this.createResponseWithBody(file as unknown as BodyInit, {
				headers,
			});
		} catch (error) {
			const err = error as Error & { code?: string; cause?: { code?: string } };
			const code = err.code || err.cause?.code;
			if (code === 'ENOENT') {
				appLogger.debug('File not found', filePath);
			} else {
				appLogger.error('Error reading file', filePath, err);
			}
			return null;
		}
	}

	/**
	 * Returns shared cache headers for an emitted static file.
	 *
	 * @remarks
	 * HTML keeps a stable URL and is always revalidated, and so does every file the
	 * build did not record as content-hashed, such as public files and vendor
	 * runtimes. Immutable caching is based on the output registry populated by
	 * build writers, never the filename.
	 */
	private fileCacheHeaders(filePath: string, file: Buffer): HeadersInit & { ETag: string } {
		const etag = `"${hashBrowserAssetBytes(file)}"`;
		const extension = path.extname(filePath).toLowerCase();
		if (extension === '.html') {
			return { 'Cache-Control': 'public, max-age=0, must-revalidate', ETag: etag };
		}

		if (this.options.watchMode) {
			return { 'Cache-Control': 'no-cache', ETag: etag };
		}

		if (isHashedBrowserAsset(filePath)) {
			return { 'Cache-Control': 'public, max-age=31536000, immutable', ETag: etag };
		}

		return { 'Cache-Control': 'public, max-age=0, must-revalidate', ETag: etag };
	}
}

function acceptsGzip(acceptEncoding: string | null | undefined): boolean {
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

function matchesIfNoneMatch(ifNoneMatch: string | null | undefined, etag: string): boolean {
	if (!ifNoneMatch) return false;

	return ifNoneMatch.split(',').some((value) => {
		const candidate = value.trim();
		return candidate === '*' || candidate === etag || candidate === `W/${etag}`;
	});
}
