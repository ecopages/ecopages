import { STATUS_MESSAGE } from '../../constants.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig, FileSystemServerOptions } from '../../internal-types.ts';
import type { RouteRendererBody } from '../../public-types.ts';
import type { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import { fileSystem } from '@ecopages/file-system';

export class FileSystemServerResponseFactory {
	private appConfig: EcoPagesAppConfig;
	private routeRendererFactory: RouteRendererFactory;
	private options: FileSystemServerOptions;

	constructor({
		appConfig,
		routeRendererFactory,
		options,
	}: {
		appConfig: EcoPagesAppConfig;
		routeRendererFactory: RouteRendererFactory;
		options: FileSystemServerOptions;
	}) {
		this.appConfig = appConfig;
		this.routeRendererFactory = routeRendererFactory;
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

	async createCustomNotFoundResponse() {
		const error404TemplatePath = this.appConfig.absolutePaths.error404TemplatePath;

		try {
			fileSystem.verifyFileExists(error404TemplatePath);
		} catch {
			appLogger.debug(
				'Custom 404 template not found, falling back to default 404 response',
				error404TemplatePath,
			);
			return this.createDefaultNotFoundResponse();
		}

		const routeRenderer = this.routeRendererFactory.createRenderer(error404TemplatePath);

		const result = await routeRenderer.createRoute({
			file: error404TemplatePath,
		});

		return await this.createResponseWithBody(result.body, {
			status: 404,
			statusText: STATUS_MESSAGE[404],
			headers: {
				'Content-Type': 'text/html',
			},
		});
	}

	async createFileResponse(filePath: string, contentType: string) {
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
			return this.createCustomNotFoundResponse();
		}
	}
}
