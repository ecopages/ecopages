import { STATUS_MESSAGE } from '../../constants.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig, FileSystemServerOptions } from '../../internal-types.ts';
import type { RouteRendererBody } from '../../public-types.ts';
import type { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import { FileUtils } from '../../utils/file-utils.module.ts';

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

  createResponseWithBody(
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

    console.log('error404TemplatePath', error404TemplatePath);

    try {
      FileUtils.verifyFileExists(error404TemplatePath);
    } catch (error) {
      appLogger.error(
        'Error 404 template not found, looks like it has not being configured correctly',
        error404TemplatePath,
      );
      return this.createDefaultNotFoundResponse();
    }

    const routeRenderer = this.routeRendererFactory.createRenderer(error404TemplatePath);

    const routeRendererBody = await routeRenderer.createRoute({
      file: error404TemplatePath,
    });

    return this.createResponseWithBody(routeRendererBody);
  }

  async createFileResponse(filePath: string, contentType: string) {
    try {
      let file: Buffer;
      const contentEncodingHeader: HeadersInit = {};

      if (this.shouldEnableGzip(contentType)) {
        const gzipPath = `${filePath}.gz`;
        file = FileUtils.getFileAsBuffer(gzipPath);
        contentEncodingHeader['Content-Encoding'] = 'gzip';
      } else {
        file = FileUtils.getFileAsBuffer(filePath);
      }

      return this.createResponseWithBody(file, {
        headers: {
          'Content-Type': contentType,
          ...contentEncodingHeader,
        },
      });
    } catch (error) {
      return this.createDefaultNotFoundResponse();
    }
  }
}
