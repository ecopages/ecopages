import '../../global/init.ts';
import path from 'node:path';
import type { BunRequest, RouterTypes, ServeOptions, Server, WebSocketHandler } from 'bun';
import { StaticContentServer } from '../../dev/sc-server.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import type { ApiHandler } from '../../public-types.ts';
import { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import { FSRouterScanner } from '../../router/fs-router-scanner.ts';
import { FSRouter } from '../../router/fs-router.ts';
import { AssetsDependencyService } from '../../services/assets-dependency.service.ts';
import { HtmlTransformerService } from '../../services/html-transformer.service.ts';
import { StaticSiteGenerator } from '../../static-site-generator/static-site-generator.ts';
import { deepMerge } from '../../utils/deep-merge.ts';
import { FileUtils } from '../../utils/file-utils.module.ts';
import { ProjectWatcher } from '../../watchers/project-watcher.ts';
import {
  AbstractServerAdapter,
  type ServerAdapterOptions,
  type ServerAdapterResult,
} from '../abstract/server-adapter.ts';
import { FileSystemServerResponseFactory } from '../shared/fs-server-response-factory.ts';
import { FileSystemResponseMatcher } from '../shared/fs-server-response-matcher.ts';
import { WS_PATH, appendHmrScriptToBody, makeLiveReloadScript, withHtmlLiveReload } from './hmr.ts';
import { BunRouterAdapter } from './router-adapter.ts';

export type BunServerRoutes = {
  [K: string]: RouterTypes.RouteValue<string>;
};

export type BunServeAdapterServerOptions = Partial<
  Omit<ServeOptions, 'fetch'> & {
    routes: BunServerRoutes;
    fetch(this: Server, request: Request): Promise<void | Response>;
  }
>;

export type BunServeOptions = ServeOptions & {
  routes: BunServerRoutes;
  websocket?: WebSocketHandler<any>;
};

export interface BunServerAdapterOptions extends ServerAdapterOptions {
  serveOptions: BunServeAdapterServerOptions;
  appConfig: EcoPagesAppConfig;
  apiHandlers?: ApiHandler[];
}

export interface BunServerAdapterResult extends ServerAdapterResult {
  getServerOptions: (options?: { enableHmr?: boolean }) => BunServeOptions;
  buildStatic: (options?: { preview?: boolean }) => Promise<void>;
  completeInitialization: (server: Server) => Promise<void>;
}

export class BunServerAdapter extends AbstractServerAdapter<BunServerAdapterOptions, BunServerAdapterResult> {
  declare appConfig: EcoPagesAppConfig;
  declare options: BunServerAdapterOptions['options'];
  declare serveOptions: BunServerAdapterOptions['serveOptions'];
  protected apiHandlers: ApiHandler[];

  private assetsDependencyService!: AssetsDependencyService;
  private router!: FSRouter;
  private fileSystemResponseMatcher!: FileSystemResponseMatcher;
  private routeRendererFactory!: RouteRendererFactory;
  private transformIndexHtml!: (res: Response) => Promise<Response>;
  private routes: BunServerRoutes = {};
  private htmlTransformer!: HtmlTransformerService;
  private staticSiteGenerator!: StaticSiteGenerator;
  private fullyInitialized = false;
  declare serverInstance: Server | null;

  constructor(options: BunServerAdapterOptions) {
    super(options);
    this.apiHandlers = options.apiHandlers || [];
  }

  public async initialize(): Promise<void> {
    appLogger.debugTime('BunServerAdapter:initialize');

    this.assetsDependencyService = new AssetsDependencyService({ appConfig: this.appConfig });
    this.htmlTransformer = new HtmlTransformerService();
    this.staticSiteGenerator = new StaticSiteGenerator({ appConfig: this.appConfig });

    this.setupLoaders();
    this.copyPublicDir();
    await this.initializePlugins();

    if (this.options?.watch) await this.watch();

    appLogger.debugTimeEnd('BunServerAdapter:initialize');
  }

  private setupLoaders(): void {
    const loaders = this.appConfig.loaders;
    for (const loader of loaders.values()) {
      Bun.plugin(loader);
    }
  }

  private async watch(): Promise<void> {
    const watcherInstance = new ProjectWatcher({
      config: this.appConfig,
      router: this.router,
    });

    await watcherInstance.createWatcherSubscription();
  }

  private copyPublicDir(): void {
    FileUtils.copyDirSync(
      path.join(this.appConfig.rootDir, this.appConfig.srcDir, this.appConfig.publicDir),
      path.join(this.appConfig.rootDir, this.appConfig.distDir, this.appConfig.publicDir),
    );
  }

  private async initRouter(): Promise<void> {
    const scanner = new FSRouterScanner({
      dir: path.join(this.appConfig.rootDir, this.appConfig.srcDir, this.appConfig.pagesDir),
      appConfig: this.appConfig,
      origin: '',
      templatesExt: this.appConfig.templatesExt,
      options: {
        buildMode: !this.options?.watch,
      },
    });

    this.router = new FSRouter({
      origin: '',
      assetPrefix: path.join(this.appConfig.rootDir, this.appConfig.distDir),
      scanner,
    });

    await this.router.init();
  }

  private async initializePlugins(): Promise<void> {
    try {
      const processorPromises = Array.from(this.appConfig.processors.values()).map(async (processor) => {
        await processor.setup();
        if (processor.plugins) {
          for (const plugin of processor.plugins) {
            Bun.plugin(plugin);
          }
        }
        return this.registerDependencyProvider({
          name: processor.getName(),
          getDependencies: () => processor.getDependencies(),
        });
      });

      const integrationPromises = this.appConfig.integrations.map(async (integration) => {
        integration.setConfig(this.appConfig);
        integration.setDependencyService(this.assetsDependencyService);
        await integration.setup();
        return this.registerDependencyProvider({
          name: integration.name,
          getDependencies: () => integration.getDependencies(),
        });
      });

      await Promise.all([...processorPromises, ...integrationPromises]);
    } catch (error) {
      appLogger.error(`Failed to initialize plugins: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private registerDependencyProvider(provider: { name: string; getDependencies: () => any[] }): void {
    try {
      this.assetsDependencyService.registerDependencies(provider);
    } catch (error) {
      appLogger.error(
        `Failed to register dependency provider ${provider.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  private setupTransformFunction(): void {
    this.routeRendererFactory = new RouteRendererFactory({
      appConfig: this.appConfig,
    });

    this.transformIndexHtml = async (res: Response): Promise<Response> => {
      const dependencies = await this.assetsDependencyService.prepareDependencies();
      this.htmlTransformer.setProcessedDependencies(dependencies);
      let transformedResponse = await this.htmlTransformer.transform(res);

      if (this.options?.watch) {
        const liveReloadScript = makeLiveReloadScript(
          `${this.serveOptions.hostname}:${this.serveOptions.port}/${WS_PATH}`,
        );
        const html = await transformedResponse.text();
        const newHtml = appendHmrScriptToBody(html, liveReloadScript);
        transformedResponse = new Response(newHtml, transformedResponse);
      }

      return transformedResponse;
    };
  }

  private setupResponseFactories(): void {
    const fileSystemResponseFactory = new FileSystemServerResponseFactory({
      appConfig: this.appConfig,
      routeRendererFactory: this.routeRendererFactory,
      transformIndexHtml: this.transformIndexHtml,
      options: {
        watchMode: !!this.options?.watch,
        port: this.serveOptions.port ?? 3000,
      },
    });

    this.fileSystemResponseMatcher = new FileSystemResponseMatcher({
      router: this.router,
      routeRendererFactory: this.routeRendererFactory,
      fileSystemResponseFactory,
    });
  }

  private adaptRouterRoutes(): void {
    const routerAdapter = new BunRouterAdapter(this);
    this.routes = routerAdapter.adaptRoutes(this.router.routes);
  }

  public getServerOptions({ enableHmr = false } = {}): BunServeOptions {
    const serverOptions = this.buildServerSettings();
    return enableHmr ? (withHtmlLiveReload(serverOptions, this.appConfig) as BunServeOptions) : serverOptions;
  }

  private buildServerSettings(): BunServeOptions {
    const { routes, fetch, ...serverOptions } = this.serveOptions as BunServeAdapterServerOptions;
    const handleNoMatch = this.handleNoMatch.bind(this);

    let mergedRoutes = deepMerge(routes || {}, this.routes);

    for (const handler of this.apiHandlers) {
      const method = handler.method || 'GET';
      const path = handler.path;

      const wrappedHandler = async (request: BunRequest): Promise<Response> => {
        try {
          return await handler.handler(request);
        } catch (error) {
          appLogger.error(`Error in API handler for ${path}: ${error}`);
          return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      };

      mergedRoutes = {
        ...mergedRoutes,
        [path]: {
          ...mergedRoutes[path],
          [method.toUpperCase()]: wrappedHandler,
        },
      };
    }

    return {
      routes: mergedRoutes,
      async fetch(this: Server, request: Request) {
        if (fetch) {
          const response = await fetch.bind(this)(request);
          if (response) return response;
        }

        return handleNoMatch(request);
      },
      ...serverOptions,
    };
  }

  public async buildStatic(options?: { preview?: boolean }): Promise<void> {
    const { preview = false } = options ?? {};

    if (!this.fullyInitialized) {
      await this.initRouter();
      this.setupTransformFunction();
      this.setupResponseFactories();
      this.adaptRouterRoutes();
    }

    const baseUrl = `http://${this.serveOptions.hostname || 'localhost'}:${this.serveOptions.port || 3000}`;

    await this.staticSiteGenerator.run({
      transformIndexHtml: this.transformIndexHtml,
      router: this.router,
      baseUrl,
    });

    if (!preview) {
      appLogger.info('Build completed');
      return;
    }

    const { server } = StaticContentServer.createServer({
      appConfig: this.appConfig,
      transformIndexHtml: this.transformIndexHtml,
    });

    appLogger.info(`Preview running at http://localhost:${(server as Server).port}`);
  }

  public async completeInitialization(server: Server): Promise<void> {
    if (this.fullyInitialized) return;

    this.serverInstance = server;
    appLogger.debug('Completing server initialization with dynamic routes');

    await this.initRouter();

    this.setupTransformFunction();
    this.setupResponseFactories();

    this.adaptRouterRoutes();

    this.fullyInitialized = true;

    if (server && typeof server.reload === 'function') {
      const updatedOptions = this.getServerOptions(this.options?.watch ? { enableHmr: true } : undefined);
      server.reload(updatedOptions);
      appLogger.debug('Server routes updated with dynamic routes');
    }
  }

  public async createAdapter(): Promise<BunServerAdapterResult> {
    await this.initialize();

    return {
      getServerOptions: this.getServerOptions.bind(this),
      buildStatic: this.buildStatic.bind(this),
      completeInitialization: this.completeInitialization.bind(this),
    };
  }

  public async handleRequest(request: Request): Promise<Response> {
    return this.handleResponse(request);
  }

  /**
   * Handles HTTP requests from the router adapter.
   */
  public async handleResponse(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    const match = !pathname.includes('.') && this.router.match(request.url);

    if (match) {
      const response = await this.fileSystemResponseMatcher.handleMatch(match);

      if (this.transformIndexHtml && response.headers.get('content-type')?.includes('text/html')) {
        return this.transformIndexHtml(response);
      }

      return response;
    }

    return this.handleNoMatch(request);
  }

  /**
   * Handles requests that do not match any routes.
   */
  private async handleNoMatch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    return await this.fileSystemResponseMatcher.handleNoMatch(pathname);
  }
}

/**
 * Factory function to create a Bun server adapter
 */
export async function createBunServerAdapter(options: BunServerAdapterOptions): Promise<BunServerAdapterResult> {
  const adapter = new BunServerAdapter(options);
  return adapter.createAdapter();
}
