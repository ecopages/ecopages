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

	isHtmlOrPlainText(contentType: string) {
		return ['text/html', 'text/plain'].includes(contentType);
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
		} catch (error) {
			appLogger.error(
				'Error 404 template not found, looks like it has not being configured correctly',
				error404TemplatePath,
				error as Error,
			);
			return this.createDefaultNotFoundResponse();
		}

		const routeRenderer = this.routeRendererFactory.createRenderer(error404TemplatePath);

		const routeRendererBody = await routeRenderer.createRoute({
			file: error404TemplatePath,
		});

		return await this.createResponseWithBody(routeRendererBody);
	}

	async createFileResponse(filePath: string, contentType: string) {
		try {
			let file: Buffer;
			const contentEncodingHeader: HeadersInit = {};

			if (this.shouldEnableGzip(contentType)) {
				const gzipPath = `${filePath}.gz`;
				file = fileSystem.readFileAsBuffer(gzipPath);
				contentEncodingHeader['Content-Encoding'] = 'gzip';
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
			return this.createDefaultNotFoundResponse();
		}
	}
}
