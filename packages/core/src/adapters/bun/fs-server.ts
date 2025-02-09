import path from 'node:path';
import type { Server } from 'bun';
import { FileUtils } from '../../file-utils.ts';
import { appLogger } from '../../global/app-logger.ts';
import { IntegrationManager } from '../../integration/integration-manager.ts';
import type {
  EcoPagesAppConfig,
  EcoPagesFileSystemServerAdapter,
  FileSystemServerOptions,
} from '../../internal-types.ts';
import { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import { FSRouterScanner } from '../../router/fs-router-scanner.ts';
import { FSRouter } from '../../router/fs-router.ts';
import { FileSystemServerResponseFactory } from '../shared/fs-server-response-factory.ts';
import { FileSystemResponseMatcher } from '../shared/fs-server-response-matcher.ts';
import { type PureWebSocketServeOptions, withHtmlLiveReload } from './hmr.ts';

export class BunFileSystemServerAdapter implements EcoPagesFileSystemServerAdapter<PureWebSocketServeOptions<unknown>> {
  private appConfig: EcoPagesAppConfig;
  private router: FSRouter;
  private server: Server | null = null;
  private options: FileSystemServerOptions;
  private fileSystemResponseMatcher: FileSystemResponseMatcher;

  constructor({
    router,
    appConfig,
    options,
    fileSystemResponseMatcher,
  }: {
    router: FSRouter;
    appConfig: EcoPagesAppConfig;
    options: FileSystemServerOptions;
    fileSystemResponseMatcher: FileSystemResponseMatcher;
  }) {
    this.router = router;
    this.appConfig = appConfig;
    this.options = options;
    this.fileSystemResponseMatcher = fileSystemResponseMatcher;
  }

  async fetch(req: Request) {
    const match = !req.url.includes('.') && this.router.match(req.url);

    if (!match) {
      return this.fileSystemResponseMatcher.handleNoMatch(req.url.replace(this.router.origin, ''));
    }

    return this.fileSystemResponseMatcher.handleMatch(match);
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

    const routeRendererFactory = new RouteRendererFactory({
      appConfig,
    });

    const fileSystemResponseFactory = new FileSystemServerResponseFactory({
      appConfig,
      routeRendererFactory,
      options: {
        watchMode,
        port,
      },
    });

    const fileSystemResponseMatcher = new FileSystemResponseMatcher({
      router,
      routeRendererFactory,
      fileSystemResponseFactory,
    });

    const server = new BunFileSystemServerAdapter({
      router,
      appConfig,
      fileSystemResponseMatcher,
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
