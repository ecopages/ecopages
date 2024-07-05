import path from 'node:path';
import type { Server } from 'bun';
import { appLogger } from '../../global/app-logger.ts';
import type {
  EcoPagesAppConfig,
  EcoPagesFileSystemServerAdapter,
  FileSystemServerOptions,
} from '../../internal-types.ts';
import { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import { FSRouterScanner } from '../../router/fs-router-scanner.ts';
import { FSRouter } from '../../router/fs-router.ts';
import { FileSystemServerResponseFactory } from '../fs-server-response-factory.ts';
import { type PureWebSocketServeOptions, withHtmlLiveReload } from './hmr.ts';

export class BunFileSystemServerAdapter implements EcoPagesFileSystemServerAdapter<PureWebSocketServeOptions<unknown>> {
  private appConfig: EcoPagesAppConfig;
  private router: FSRouter;
  private server: Server | null = null;
  private options: FileSystemServerOptions;
  private responseFactory: FileSystemServerResponseFactory;

  constructor({
    router,
    appConfig,
    options,
    responseFactory,
  }: {
    router: FSRouter;
    appConfig: EcoPagesAppConfig;
    options: FileSystemServerOptions;
    responseFactory: FileSystemServerResponseFactory;
  }) {
    this.router = router;
    this.appConfig = appConfig;
    this.options = options;
    this.responseFactory = responseFactory;
  }

  async fetch(req: Request) {
    const match = !req.url.includes('.') && this.router.match(req.url);

    if (!match) {
      return this.responseFactory.handleNoMatch(req.url.replace(this.router.origin, ''));
    }

    return this.responseFactory.handleMatch(match);
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

  static async createServer({
    appConfig,
    options: { watchMode, port = 3000 },
  }: {
    appConfig: EcoPagesAppConfig;
    options: FileSystemServerOptions;
  }): Promise<{
    router: FSRouter;
    server: Server;
  }> {
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

    const responseFactory = new FileSystemServerResponseFactory({
      appConfig,
      router,
      routeRendererFactory: new RouteRendererFactory({
        integrations: appConfig.integrations,
        appConfig,
      }),
      options: {
        watchMode,
        port,
      },
    });

    const server = new BunFileSystemServerAdapter({
      router,
      appConfig,
      responseFactory,
      options: {
        watchMode,
        port,
      },
    });

    await router.init();

    const serverOptions = {
      fetch: server.fetch.bind(server),
      port,
    };

    return server.startServer(serverOptions);
  }
}
