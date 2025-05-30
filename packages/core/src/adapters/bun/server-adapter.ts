import path from 'node:path';
import type { BunRequest, RouterTypes, ServeOptions, Server, WebSocketHandler } from 'bun';
import { RESOLVED_ASSETS_DIR } from '../../constants.ts';
import { StaticContentServer } from '../../dev/sc-server.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import type { ApiHandler } from '../../public-types.ts';
import { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import { FSRouterScanner } from '../../router/fs-router-scanner.ts';
import { FSRouter } from '../../router/fs-router.ts';
import { StaticSiteGenerator } from '../../static-site-generator/static-site-generator.ts';
import { deepMerge } from '../../utils/deep-merge.ts';
import { FileUtils } from '../../utils/file-utils.module.ts';
import { ProjectWatcher } from '../../watchers/project-watcher.ts';
import {
  AbstractServerAdapter,
  type ServerAdapterOptions,
  type ServerAdapterResult,
} from '../abstract/server-adapter.ts';
import { ApiResponseBuilder } from '../shared/api-response.js';
import { FileSystemServerResponseFactory } from '../shared/fs-server-response-factory.ts';
import { FileSystemResponseMatcher } from '../shared/fs-server-response-matcher.ts';
import { hmrServerError, hmrServerReload, withHtmlLiveReload } from './hmr.ts';
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
  apiHandlers?: ApiHandler<any, BunRequest, Server>[];
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
  protected apiHandlers: ApiHandler<any, BunRequest>[];

  private router!: FSRouter;
  private fileSystemResponseMatcher!: FileSystemResponseMatcher;
  private routeRendererFactory!: RouteRendererFactory;
  private routes: BunServerRoutes = {};
  private staticSiteGenerator!: StaticSiteGenerator;
  private initializationPromise: Promise<void> | null = null;
  private fullyInitialized = false;
  declare serverInstance: Server | null;

  constructor(options: BunServerAdapterOptions) {
    super(options);
    this.apiHandlers = options.apiHandlers || [];
  }

  public async initialize(): Promise<void> {
    this.staticSiteGenerator = new StaticSiteGenerator({ appConfig: this.appConfig });

    this.setupLoaders();
    this.copyPublicDir();
    await this.initializePlugins();
  }

  private setupLoaders(): void {
    const loaders = this.appConfig.loaders;
    for (const loader of loaders.values()) {
      Bun.plugin(loader);
    }
  }

  private async refreshRouterRoutes(): Promise<void> {
    if (this.serverInstance && typeof this.serverInstance.reload === 'function') {
      try {
        await this.router.init();
        this.configureResponseHandlers();
        this.adaptRouterRoutes();
        const options = this.getServerOptions({ enableHmr: true });
        this.serverInstance.reload(options);
        appLogger.debug('Server routes updated with dynamic routes');
        hmrServerReload();
      } catch (error) {
        if (error instanceof Error) {
          hmrServerError(error);
          appLogger.error('Failed to refresh router routes:', error);
        }
      }
    } else {
      appLogger.error('Server instance is not available for reloading');
    }
  }

  private async watch(): Promise<void> {
    const refreshRouterRoutesCallback = this.refreshRouterRoutes.bind(this);
    const watcherInstance = new ProjectWatcher({
      config: this.appConfig,
      refreshRouterRoutesCallback,
    });

    await watcherInstance.createWatcherSubscription();
  }

  private copyPublicDir(): void {
    FileUtils.copyDirSync(
      path.join(this.appConfig.rootDir, this.appConfig.srcDir, this.appConfig.publicDir),
      path.join(this.appConfig.rootDir, this.appConfig.distDir, this.appConfig.publicDir),
    );
    FileUtils.ensureDirectoryExists(path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR));
  }

  private async initRouter(): Promise<void> {
    const scanner = new FSRouterScanner({
      dir: path.join(this.appConfig.rootDir, this.appConfig.srcDir, this.appConfig.pagesDir),
      appConfig: this.appConfig,
      origin: this.runtimeOrigin,
      templatesExt: this.appConfig.templatesExt,
      options: {
        buildMode: !this.options?.watch,
      },
    });

    this.router = new FSRouter({
      origin: this.runtimeOrigin,
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
      });

      const integrationPromises = this.appConfig.integrations.map(async (integration) => {
        integration.setConfig(this.appConfig);
        integration.setRuntimeOrigin(this.runtimeOrigin);
        await integration.setup();
      });

      await Promise.all([...processorPromises, ...integrationPromises]);
    } catch (error) {
      appLogger.error(`Failed to initialize plugins: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private configureResponseHandlers(): void {
    this.routeRendererFactory = new RouteRendererFactory({
      appConfig: this.appConfig,
      runtimeOrigin: this.runtimeOrigin,
    });

    const fileSystemResponseFactory = new FileSystemServerResponseFactory({
      appConfig: this.appConfig,
      routeRendererFactory: this.routeRendererFactory,
      options: {
        watchMode: !!this.options?.watch,
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

  /**
   * Creates complete server configuration with merged routes, API handlers, and request handling.
   * @returns Server options ready for Bun.serve()
   */
  private buildServerSettings(): BunServeOptions {
    const { routes, fetch, ...serverOptions } = this.serveOptions as BunServeAdapterServerOptions;
    const handleNoMatch = this.handleNoMatch.bind(this);
    const waitForInit = this.waitForInitialization.bind(this);
    const handleReq = this.handleRequest.bind(this);

    const mergedRoutes = deepMerge(routes || {}, this.routes);

    for (const routeConfig of this.apiHandlers) {
      const method = routeConfig.method || 'GET';
      const path = routeConfig.path;

      const wrappedHandler = async (request: BunRequest<string>): Promise<Response> => {
        try {
          await waitForInit();
          return await routeConfig.handler({
            request,
            response: new ApiResponseBuilder(),
            server: this.serverInstance,
          });
        } catch (error) {
          appLogger.error(`[ecopages] Error handling API request: ${error}`);
          return new Response('Internal Server Error', { status: 500 });
        }
      };

      mergedRoutes[path] = {
        [method.toUpperCase()]: wrappedHandler,
      };
    }

    return {
      ...serverOptions,
      routes: mergedRoutes,
      async fetch(this: Server, request: Request) {
        try {
          await waitForInit();
          const response = await handleReq(request);
          return response;
        } catch (error) {
          appLogger.error(`[ecopages] Error handling request: ${error}`);
          return new Response('Internal Server Error', { status: 500 });
        }
      },
      error(this: Server, error: Error) {
        return handleNoMatch(new Request('http://localhost'));
      },
    };
  }

  /**
   * Generates a static build of the site for deployment.
   * @param options.preview - If true, starts a preview server after build
   */
  public async buildStatic(options?: { preview?: boolean }): Promise<void> {
    const { preview = false } = options ?? {};

    if (!this.fullyInitialized) {
      await this.initRouter();
      this.configureResponseHandlers();
      this.adaptRouterRoutes();
    }

    const baseUrl = `http://${this.serveOptions.hostname || 'localhost'}:${this.serveOptions.port || 3000}`;

    await this.staticSiteGenerator.run({
      router: this.router,
      baseUrl,
    });

    if (!preview) {
      appLogger.info('Build completed');
      return;
    }

    const { server } = StaticContentServer.createServer({
      appConfig: this.appConfig,
    });

    appLogger.info(`Preview running at http://localhost:${(server as Server).port}`);
  }

  /**
   * Initializes the server with dynamic routes after server creation.
   * Must be called before handling any requests.
   * @param server - The Bun server instance
   */
  public async completeInitialization(server: Server): Promise<void> {
    if (this.fullyInitialized) return;

    if (!this.initializationPromise) {
      this.initializationPromise = this._performInitialization(server);
    }

    return this.initializationPromise;
  }

  /**
   * Performs complete server setup including routing, watchers, and HMR.
   */
  private async _performInitialization(server: Server): Promise<void> {
    this.serverInstance = server;
    appLogger.debug('Completing server initialization with dynamic routes');

    await this.initRouter();
    this.configureResponseHandlers();
    this.adaptRouterRoutes();

    this.fullyInitialized = true;

    if (this.options?.watch) await this.watch();

    if (server && typeof server.reload === 'function') {
      const updatedOptions = this.getServerOptions(this.options?.watch ? { enableHmr: true } : undefined);
      server.reload(updatedOptions);
      appLogger.debug('Server routes updated with dynamic routes');
    }
  }

  /**
   * Creates and initializes the Bun server adapter.
   * @returns Configured adapter with server methods
   */
  public async createAdapter(): Promise<BunServerAdapterResult> {
    await this.initialize();

    return {
      getServerOptions: this.getServerOptions.bind(this),
      buildStatic: this.buildStatic.bind(this),
      completeInitialization: this.completeInitialization.bind(this),
    };
  }

  /**
   * Handles HTTP requests from the router adapter.
   */
  public async handleRequest(request: Request): Promise<Response> {
    return this.handleResponse(request);
  }

  /**
   * Ensures server initialization completes before request handling.
   * Prevents race conditions during startup.
   */
  private async waitForInitialization(): Promise<void> {
    if (this.fullyInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    throw new Error('Server not initialized. Call completeInitialization() first.');
  }

  /**
   * Handles HTTP requests from the router adapter.
   */
  public async handleResponse(request: Request): Promise<Response> {
    await this.waitForInitialization();

    const pathname = new URL(request.url).pathname;
    const match = !pathname.includes('.') && this.router.match(request.url);

    if (match) {
      try {
        const response = await this.fileSystemResponseMatcher.handleMatch(match);
        return response;
      } catch (error) {
        if (error instanceof Error) {
          hmrServerError(error);
          appLogger.error('Error handling route match:', error);
        }
        return new Response('Internal Server Error', { status: 500 });
      }
    }

    return this.handleNoMatch(request);
  }

  /**
   * Handles requests that do not match any routes.
   */
  private async handleNoMatch(request: Request): Promise<Response> {
    await this.waitForInitialization();

    try {
      const pathname = new URL(request.url).pathname;
      return await this.fileSystemResponseMatcher.handleNoMatch(pathname);
    } catch (error) {
      if (error instanceof Error) {
        hmrServerError(error);
        appLogger.error('Error handling no match:', error);
      }
      return new Response('Internal Server Error', { status: 500 });
    }
  }
}

/**
 * Factory function to create a Bun server adapter
 */
export async function createBunServerAdapter(options: BunServerAdapterOptions): Promise<BunServerAdapterResult> {
  const adapter = new BunServerAdapter(options);
  return adapter.createAdapter();
}
