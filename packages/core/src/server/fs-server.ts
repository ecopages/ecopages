import path from 'node:path';
import { RouteRendererFactory } from '@/route-renderer/route-renderer';
import { appLogger } from '@/utils/app-logger';
import { FileUtils } from '@/utils/file-utils.module';
import type { EcoPagesConfig, MatchResult, RouteRendererBody } from '@types';
import type { BunFile, Server } from 'bun';
import { type PureWebSocketServeOptions, withHtmlLiveReload } from './middleware/hmr';
import { FSRouter } from './router/fs-router';
import { FSRouterScanner } from './router/fs-router-scanner';
import { ServerUtils } from './server-utils.module';

type FileSystemServerOptions = {
  watchMode: boolean;
};

export class FileSystemServer {
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

  public async fetch(req: Request) {
    const match = !req.url.includes('.') && this.router.match(req);

    if (!match) {
      return this.handleNoMatch(req);
    }

    return this.handleMatch(match);
  }

  private async handleNoMatch(req: Request) {
    const filePath = path.join(this.router.assetPrefix, req.url.replace(this.router.origin, ''));
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

  public startServer(serverOptions: PureWebSocketServeOptions<unknown>) {
    this.server = this.options.watchMode
      ? Bun.serve(withHtmlLiveReload(serverOptions, this.appConfig))
      : Bun.serve(serverOptions);

    this.router.onReload = () => {
      if (this.server) this.server.reload(serverOptions);
    };

    return { router: this.router, server: this.server };
  }

  static async create({
    appConfig,
    options: { watchMode },
  }: { appConfig: EcoPagesConfig; options: FileSystemServerOptions }) {
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

    const server = new FileSystemServer({
      router,
      appConfig: appConfig,
      routeRendererFactory: new RouteRendererFactory({ integrations: appConfig.integrations, appConfig }),
      options: { watchMode },
    });

    const serverOptions = {
      fetch: server.fetch.bind(server),
    };

    return server.startServer(serverOptions);
  }
}
