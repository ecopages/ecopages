import path from 'node:path';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig, FileSystemServerOptions, MatchResult } from '../internal-types.ts';
import type { RouteRendererBody } from '../public-types.ts';
import type { RouteRendererFactory } from '../route-renderer/route-renderer.ts';
import type { FSRouter } from '../router/fs-router.ts';
import { FileUtils } from '../utils/file-utils.module.ts';
import { ServerUtils } from './server-utils.module.ts';

export class FileSystemServerResponseFactory {
  private router: FSRouter;
  private appConfig: EcoPagesAppConfig;
  private routeRendererFactory: RouteRendererFactory;
  private options: FileSystemServerOptions;

  constructor({
    appConfig,
    router,
    routeRendererFactory,
    options,
  }: {
    appConfig: EcoPagesAppConfig;
    router: FSRouter;
    routeRendererFactory: RouteRendererFactory;
    options: FileSystemServerOptions;
  }) {
    this.appConfig = appConfig;
    this.router = router;
    this.routeRendererFactory = routeRendererFactory;
    this.options = options;
  }

  private isHtmlOrPlainText(contentType: string) {
    return ['text/html', 'text/plain'].includes(contentType);
  }

  private shouldEnableGzip(contentType: string) {
    if (this.options.watchMode) return false;
    const gzipEnabledExtensions = ['text/javascript', 'text/css'];
    return gzipEnabledExtensions.includes(contentType);
  }

  private createResponseWithBody(routeRendererBody: RouteRendererBody) {
    return new Response(routeRendererBody as BodyInit, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  }

  private async createNotFoundResponse() {
    const error404TemplatePath = this.appConfig.absolutePaths.error404TemplatePath;

    try {
      FileUtils.verifyFileExists(error404TemplatePath);
    } catch (error) {
      appLogger.error(
        'Error 404 template not found, looks like it has not being configured correctly',
        error404TemplatePath,
      );
      return new Response('file not found', {
        status: 404,
      });
    }

    const routeRenderer = this.routeRendererFactory.createRenderer(error404TemplatePath);

    const routeRendererBody = await routeRenderer.createRoute({
      file: error404TemplatePath,
    });

    return this.createResponseWithBody(routeRendererBody);
  }

  private async createFileResponse(filePath: string, contentType: string) {
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

      return new Response(file, {
        headers: {
          'Content-Type': contentType,
          ...contentEncodingHeader,
        },
      });
    } catch (error) {
      return new Response('file not found', {
        status: 404,
      });
    }
  }

  async handleNoMatch(requestUrl: string) {
    const filePath = path.join(this.router.assetPrefix, requestUrl);
    const contentType = ServerUtils.getContentType(filePath);

    if (this.isHtmlOrPlainText(contentType)) {
      return this.createNotFoundResponse();
    }

    return this.createFileResponse(filePath, contentType);
  }

  async handleMatch(match: MatchResult) {
    const routeRenderer = this.routeRendererFactory.createRenderer(match.filePath);

    const renderedBody = await routeRenderer.createRoute({
      file: match.filePath,
      params: match.params,
      query: match.query,
    });

    return this.createResponseWithBody(renderedBody);
  }
}
