import { STATUS_MESSAGE } from '../../config/constants.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig, FileSystemServerOptions } from '../../types/internal-types.ts';
import type { RouteRendererBody } from '../../types/public-types.ts';
import { fileSystem } from '@ecopages/file-system';

/**
 * Builds HTTP responses for static files and shared file-system fallbacks.
 */
export class FileSystemServerResponseFactory {
	private appConfig: EcoPagesAppConfig;
	private options: FileSystemServerOptions;

	constructor({ appConfig, options }: { appConfig: EcoPagesAppConfig; options: FileSystemServerOptions }) {
		this.appConfig = appConfig;
		this.options = options;
	}

	isHtml(contentType: string) {
		return contentType === 'text/html';
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

	async createDefaultNotFoundResponse() {
		return new Response(STATUS_MESSAGE[404], {
			status: 404,
		});
	}

	/**
	 * Wraps already-rendered HTML in a 404 response envelope.
	 */
	async createHtmlNotFoundResponse(body: RouteRendererBody) {
		return await this.createResponseWithBody(body, {
			status: 404,
			statusText: STATUS_MESSAGE[404],
			headers: {
				'Content-Type': 'text/html',
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
