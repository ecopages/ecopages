import path from 'node:path';
import { ServerUtils } from '@/adapters/server-utils.module';
import { appLogger } from '@/global/app-logger';
import { RouteRendererFactory } from '@/route-renderer/route-renderer';
import { FSRouter } from '@/router/fs-router';
import { FSRouterScanner } from '@/router/fs-router-scanner';
import { FileUtils } from '@/utils/file-utils.module';
import type {
  EcoPagesConfig,
  EcoPagesFileSystemServerAdapter,
  FileSystemServerOptions,
  MatchResult,
  RouteRendererBody,
} from '@types';
import type { Server } from 'bun';
import { type PureWebSocketServeOptions, withHtmlLiveReload } from './hmr';

export class BunFileSystemServerAdapter implements EcoPagesFileSystemServerAdapter<PureWebSocketServeOptions<unknown>> {
  private appConfig: EcoPagesConfig;
  private router: FSRouter;
  private routeRendererFactory: RouteRendererFactory;
  private server: Server | null = null;
  private options: FileSystemServerOptions;

  constructor({
    router,
    appConfig,
    routeRendererFactory,
    options,
  }: {
    router: FSRouter;
    appConfig: EcoPagesConfig;
    routeRendererFactory: RouteRendererFactory;
    options: FileSystemServerOptions;
  }) {
    this.router = router;
    this.appConfig = appConfig;
    this.routeRendererFactory = routeRendererFactory;
    this.options = options;
  }

  private shouldEnableGzip(contentType: string) {
    if (this.options.watchMode) return false;
    const gzipEnabledExtensions = ['text/javascript', 'text/css'];
    return gzipEnabledExtensions.includes(contentType);
  }

  async fetch(req: Request) {
    const match = !req.url.includes('.') && this.router.match(req.url);

    if (!match) {
      return this.handleNoMatch(req.url.replace(this.router.origin, ''));
    }

    return this.handleMatch(match);
  }

  private async handleNoMatch(requestUrl: string) {
    const filePath = path.join(this.router.assetPrefix, requestUrl);
    const contentType = ServerUtils.getContentType(filePath);

    if (this.isHtmlOrPlainText(contentType)) {
      return this.sendNotFoundPage();
    }

    return this.createFileResponse(filePath, contentType);
  }

  private isHtmlOrPlainText(contentType: string) {
    return ['text/html', 'text/plain'].includes(contentType);
  }

  private sendResponse(routeRendererBody: RouteRendererBody) {
    return new Response(routeRendererBody as BodyInit, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  }

  private async sendNotFoundPage() {
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

    return this.sendResponse(routeRendererBody);
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

  private async handleMatch(match: MatchResult) {
    const routeRenderer = this.routeRendererFactory.createRenderer(match.filePath);

    const renderedBody = await routeRenderer.createRoute({
      file: match.filePath,
      params: match.params,
      query: match.query,
    });

    return this.sendResponse(renderedBody);
  }

  public startServer(serverOptions: PureWebSocketServeOptions<unknown>): {
    router: FSRouter;
    server: Server;
  } {
    this.server = this.options.watchMode
      ? Bun.serve(withHtmlLiveReload(serverOptions, this.appConfig))
      : Bun.serve(serverOptions);

    this.router.onReload = () => {
      if (this.server) this.server.reload(serverOptions);
    };

    appLogger.info(`Bun server listening at ${(this.server as Server).url}`);

    return { router: this.router, server: this.server };
  }

  static async create({
    appConfig,
    options: { watchMode, port = 3000 },
  }: {
    appConfig: EcoPagesConfig;
    options: FileSystemServerOptions;
  }) {
    const scanner = new FSRouterScanner({
      dir: path.join(appConfig.rootDir, appConfig.srcDir, appConfig.pagesDir),
      origin: appConfig.baseUrl,
      templatesExt: appConfig.templatesExt,
      options: {
        buildMode: !watchMode,
      },
    });

    const router = new FSRouter({
      origin: appConfig.baseUrl,
      assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
      scanner,
    });

    await router.init();

    const server = new BunFileSystemServerAdapter({
      router,
      appConfig: appConfig,
      routeRendererFactory: new RouteRendererFactory({
        integrations: appConfig.integrations,
        appConfig,
      }),
      options: { watchMode, port },
    });

    const serverOptions = {
      fetch: server.fetch.bind(server),
      port,
    };

    return server.startServer(serverOptions);
  }
}
