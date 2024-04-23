import path from 'node:path';
import { type RouteRendererBody, RouteRendererFactory } from '@/route-renderer/route-renderer';
import { FileUtils } from '@/utils/file-utils.module';
import type { EcoPagesConfig } from '@types';
import type { BunFile, Server } from 'bun';
import { type PureWebSocketServeOptions, withHtmlLiveReload } from './middleware/hmr';
import { FSRouter, type MatchResult } from './router/fs-router';
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
    const isAsync = routeRendererBody.constructor.name === 'AsyncFunction';

    return new Response(routeRendererBody as BodyInit, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  }

  private async sendNotFoundPage() {
    const error404TemplatePath = this.appConfig.absolutePaths.error404TemplatePath;

    try {
      await FileUtils.get(error404TemplatePath);
    } catch (error) {
      return new Response('file not found', {
        status: 404,
      });
    }

    const routeRenderer = this.routeRendererFactory.createRenderer(error404TemplatePath);

    const routeRendererConfig = await routeRenderer.createRoute({
      file: error404TemplatePath,
    });

    return this.sendResponse(routeRendererConfig);
  }

  private async createFileResponse(filePath: string, contentType: string) {
    try {
      let file: BunFile;
      const contentEncodingHeader: HeadersInit = {};

      if (this.shouldEnableGzip(contentType)) {
        const gzipPath = `${filePath}.gz`;
        file = await FileUtils.get(gzipPath);
        contentEncodingHeader['Content-Encoding'] = 'gzip';
      } else {
        file = await FileUtils.get(filePath);
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

    const routeRendererConfig = await routeRenderer.createRoute({
      file: match.filePath,
      params: match.params,
      query: match.query,
    });

    return this.sendResponse(routeRendererConfig);
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

  static async create(options: FileSystemServerOptions) {
    const { ecoConfig } = globalThis;

    const scanner = new FSRouterScanner({
      dir: path.join(ecoConfig.rootDir, ecoConfig.srcDir, ecoConfig.pagesDir),
      origin: ecoConfig.baseUrl,
      templatesExt: ecoConfig.templatesExt,
      options: {
        buildMode: !options.watchMode,
      },
    });

    const router = new FSRouter({
      origin: ecoConfig.baseUrl,
      assetPrefix: path.join(ecoConfig.rootDir, ecoConfig.distDir),
      scanner,
    });

    await router.init();

    const server = new FileSystemServer({
      router,
      appConfig: ecoConfig,
      routeRendererFactory: new RouteRendererFactory({ integrations: ecoConfig.integrations }),
      options,
    });

    const serverOptions = {
      fetch: server.fetch.bind(server),
    };

    return server.startServer(serverOptions);
  }
}
