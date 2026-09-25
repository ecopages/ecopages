import { STATUS_MESSAGE } from '../../../config/constants.ts';
import { appLogger } from '../../../global/app-logger.ts';
import type { FileSystemServerOptions } from '../../../types/internal-types.ts';
import type { RouteRendererBody } from '../../../types/public-types.ts';
import { fileSystem } from '@ecopages/file-system';

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
	async createFileResponse(filePath: string, contentType: string): Promise<Response | null> {
		try {
			let file: Buffer;
			const contentEncodingHeader: HeadersInit = {};

			if (this.shouldEnableGzip(contentType)) {
				const gzipPath = `${filePath}.gz`;
				if (fileSystem.exists(gzipPath)) {
					file = fileSystem.readFileAsBuffer(gzipPath);
					contentEncodingHeader['Content-Encoding'] = 'gzip';
					contentEncodingHeader['Vary'] = 'Accept-Encoding';
				} else {
					appLogger.debug('Gzip file not found, serving uncompressed', gzipPath);
					file = fileSystem.readFileAsBuffer(filePath);
				}
			} else {
				file = fileSystem.readFileAsBuffer(filePath);
			}

			return await this.createResponseWithBody(file as unknown as BodyInit, {
				headers: {
					'Content-Type': contentType,
					...contentEncodingHeader,
				},
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
}
