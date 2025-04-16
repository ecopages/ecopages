import '../../global/init.ts';
import path from 'node:path';
import type { RouterTypes, ServeOptions, Server, WebSocketHandler } from 'bun';
import { StaticContentServer } from 'src/dev/sc-server.ts';
import { appLogger } from '../../global/app-logger';
import type { EcoPagesAppConfig } from '../../internal-types';
import { ProjectWatcher } from '../../main/project-watcher';
import { StaticPageGenerator } from '../../main/static-page-generator.ts';
import { RouteRendererFactory } from '../../route-renderer/route-renderer';
import { FSRouter } from '../../router/fs-router';
import { FSRouterScanner } from '../../router/fs-router-scanner';
import { AssetsDependencyService } from '../../services/assets-dependency.service';
import { HtmlTransformerService } from '../../services/html-transformer.service';
import { deepMerge } from '../../utils/deep-merge';
import { FileUtils } from '../../utils/file-utils.module';
import { FileSystemServerResponseFactory } from '../shared/fs-server-response-factory';
import { FileSystemResponseMatcher } from '../shared/fs-server-response-matcher';
import { WS_PATH, appendHmrScriptToBody, makeLiveReloadScript, withHtmlLiveReload } from './hmr';
import { BunRouterAdapter } from './router-adapter.ts';

type BunServerRoutes = {
  [K: string]: RouterTypes.RouteValue<string>;
};

type BunServeAdapterServerOptions = Partial<
  Omit<ServeOptions, 'fetch'> & {
    routes: BunServerRoutes;
    fetch(this: Server, request: Request): Promise<void | Response>;
  }
>;

type BunServeOptions = ServeOptions & {
  routes: BunServerRoutes;
  websocket?: WebSocketHandler<any>;
};

type BunServerAdapterOptions = {
  watch?: boolean;
};

interface IBunServerAdapterConstructor {
  options: BunServerAdapterOptions;
  serveOptions: BunServeAdapterServerOptions;
  appConfig: EcoPagesAppConfig;
  assetsDependencyService: AssetsDependencyService;
  router: FSRouter;
  fileSystemResponseMatcher: FileSystemResponseMatcher;
  routeRendererFactory: RouteRendererFactory;
  transformIndexHtml: (res: Response) => Promise<Response>;
}

export class BunServerAdapter {
  private options: BunServerAdapterOptions;
  private serveOptions: BunServeAdapterServerOptions;
  private appConfig: EcoPagesAppConfig;
  private assetsDependencyService: AssetsDependencyService;
  private router: FSRouter;
  private fileSystemResponseMatcher: FileSystemResponseMatcher;
  private routes: BunServerRoutes = {};
  private transformIndexHtml: (res: Response) => Promise<Response>;

  constructor(config: IBunServerAdapterConstructor) {
    this.options = config.options;
    this.serveOptions = config.serveOptions;
    this.appConfig = config.appConfig;
    this.assetsDependencyService = config.assetsDependencyService;
    this.router = config.router;
    this.fileSystemResponseMatcher = config.fileSystemResponseMatcher;
    this.transformIndexHtml = config.transformIndexHtml;
  }

  public async initialize() {
    appLogger.debugTime('BunServerAdapter:initialize');
    this.setupLoaders();
    this.copyPublicDir();
    await this.initializePlugins();
    await this.initRouter();
    this.collectRoutes();
    if (this.options.watch) await this.watch();
    appLogger.debugTimeEnd('BunServerAdapter:initialize');
  }

  public buildServerSettings(): BunServeOptions {
    const { routes, fetch, ...serverOptions } = this.serveOptions;
    const handleNoMatch = this.handleNoMatch.bind(this);
    return {
      routes: deepMerge(routes || {}, this.routes),
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

  private setupLoaders() {
    const loaders = this.appConfig.loaders;
    for (const loader of loaders.values()) {
      Bun.plugin(loader);
    }
  }

  private async watch() {
    const watcherInstance = new ProjectWatcher({
      config: this.appConfig,
      router: this.router,
    });

    await watcherInstance.createWatcherSubscription();
  }

  private copyPublicDir() {
    FileUtils.copyDirSync(
      path.join(this.appConfig.rootDir, this.appConfig.srcDir, this.appConfig.publicDir),
      path.join(this.appConfig.rootDir, this.appConfig.distDir, this.appConfig.publicDir),
    );
  }

  private async initializePlugins() {
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

  private registerDependencyProvider(provider: { name: string; getDependencies: () => any[] }) {
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

  private async initRouter() {
    await this.router.init();
  }

  private collectRoutes() {
    const routerAdapter = new BunRouterAdapter(this);
    this.routes = routerAdapter.adaptRoutes(this.router.routes);
  }

  /**
   * Handles HTTP requests from the router adapter.
   * This method centralizes request processing logic and maintains separation of concerns.
   * The router is responsible for matching routes, while this adapter handles the actual
   * request processing and response generation.
   *
   * @param req The incoming HTTP request
   * @returns A Promise resolving to the HTTP response
   */
  public async handleResponse(req: Request) {
    const pathname = new URL(req.url).pathname;
    const match = !pathname.includes('.') && this.router.match(req.url);
    if (match) {
      const response = await this.fileSystemResponseMatcher.handleMatch(match);

      if (this.transformIndexHtml && response.headers.get('content-type')?.includes('text/html')) {
        return this.transformIndexHtml(response);
      }

      return response;
    }

    return this.handleNoMatch(req);
  }

  /**
   * Handles requests that do not match any routes.
   * This method is responsible for generating a 404 response or serving static files.
   *
   * @param req The incoming HTTP request
   * @returns A Promise resolving to the HTTP response
   */
  public async handleNoMatch(req: Request) {
    const pathname = new URL(req.url).pathname;
    const response = await this.fileSystemResponseMatcher.handleNoMatch(pathname);

    return response;
  }
}

export type CreateBunServerAdapterOptions = {
  appConfig: EcoPagesAppConfig;
  serveOptions: BunServeAdapterServerOptions;
  options?: { watch: boolean } | undefined;
};

export type CreateBunServerAdapterReturn = {
  getServerOptions: (options?: { enableHmr?: boolean }) => BunServeOptions;
  buildStatic: (options?: { preview?: boolean }) => Promise<void>;
};

export async function createServerAdapter({
  appConfig,
  serveOptions,
  options = { watch: false },
}: CreateBunServerAdapterOptions): Promise<CreateBunServerAdapterReturn> {
  import.meta.env.NODE_ENV = 'development';

  const assetsDependencyService = new AssetsDependencyService({ appConfig });

  const htmlTransformer = new HtmlTransformerService();

  const scanner = new FSRouterScanner({
    dir: path.join(appConfig.rootDir, appConfig.srcDir, appConfig.pagesDir),
    origin: '',
    templatesExt: appConfig.templatesExt,
    options: {
      buildMode: !options?.watch,
    },
  });

  const router = new FSRouter({
    origin: '',
    assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
    scanner,
  });

  const routeRendererFactory = new RouteRendererFactory({
    appConfig,
  });

  /**
   * Transform the HTML response by applying the necessary transformations.
   * This includes processing dependencies and adding live reload scripts if watch mode is enabled.
   *
   * @param res The original HTML response
   * @returns The transformed HTML response
   */
  const transformIndexHtml = async (res: Response): Promise<Response> => {
    const dependencies = await assetsDependencyService.prepareDependencies();
    htmlTransformer.setProcessedDependencies(dependencies);
    let transformedResponse = await htmlTransformer.transform(res);

    if (options?.watch) {
      const liveReloadScript = makeLiveReloadScript(`${serveOptions.hostname}:${serveOptions.port}/${WS_PATH}`);
      const html = await transformedResponse.text();
      const newHtml = appendHmrScriptToBody(html, liveReloadScript);
      transformedResponse = new Response(newHtml, transformedResponse);
    }

    return transformedResponse;
  };

  const fileSystemResponseFactory = new FileSystemServerResponseFactory({
    appConfig,
    routeRendererFactory,
    transformIndexHtml,
    options: {
      watchMode: options?.watch,
      port: serveOptions.port ?? 3000,
    },
  });

  const fileSystemResponseMatcher = new FileSystemResponseMatcher({
    router,
    routeRendererFactory,
    fileSystemResponseFactory,
  });

  const adapter = new BunServerAdapter({
    options,
    serveOptions,
    appConfig,
    assetsDependencyService,
    router,
    fileSystemResponseMatcher,
    routeRendererFactory,
    transformIndexHtml,
  });

  const staticPageGenerator = new StaticPageGenerator({ appConfig });

  /**
   * Builds static pages for the application.
   * This function generates static HTML files for all routes and handles the preview mode.
   * If the `preview` option is set to true, it starts a server to preview the generated pages.
   *
   * @param options Optional configuration for the build process
   * @param options.preview Whether to enable preview mode (default: false)
   */
  async function buildStatic(options?: {
    preview?: boolean;
  }) {
    const { preview = false } = options ?? {};
    await staticPageGenerator.run({ transformIndexHtml });

    if (!preview) {
      appLogger.info('Build completed');
      process.exit(0);
    }

    const { server } = StaticContentServer.createServer({ appConfig, transformIndexHtml });

    appLogger.info(`Preview running at http://localhost:${(server as Server).port}`);
  }

  /**
   * Returns the server options for the Bun server.
   * If `enableHmr` is true, it applies HTML live reload to the server options.
   */
  function getServerOptions({
    enableHmr = false,
  }: {
    enableHmr?: boolean;
  } = {}): BunServeOptions {
    const serverOptions = adapter.buildServerSettings();
    return enableHmr ? (withHtmlLiveReload(serverOptions, appConfig) as BunServeOptions) : serverOptions;
  }

  await adapter.initialize();

  return {
    getServerOptions,
    buildStatic,
  };
}
