import '../../global/init.ts';
import path from 'node:path';
import type { RouterTypes, ServeOptions, Server, WebSocketHandler } from 'bun';
import { appLogger } from '../../global/app-logger';
import type { EcoPagesAppConfig } from '../../internal-types';
import { ProjectWatcher } from '../../main/project-watcher';
import { ScriptsBuilder } from '../../main/scripts-builder';
import { RouteRendererFactory } from '../../route-renderer/route-renderer';
import { FSRouter } from '../../router/fs-router';
import { FSRouterScanner } from '../../router/fs-router-scanner';
import { AssetsDependencyService } from '../../services/assets-dependency.service';
import { HtmlTransformerService } from '../../services/html-transformer.service';
import { deepMerge } from '../../utils/deep-merge';
import { FileUtils } from '../../utils/file-utils.module';
import { FileSystemServerResponseFactory } from '../shared/fs-server-response-factory';
import { FileSystemResponseMatcher } from '../shared/fs-server-response-matcher';
import { WS_PATH, appendHmrScriptToBody, makeLiveReloadScript } from './hmr';

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
  scriptsBuilder: ScriptsBuilder;
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
  private scriptsBuilder: ScriptsBuilder;
  private router: FSRouter;
  private fileSystemResponseMatcher: FileSystemResponseMatcher;
  private routes: BunServerRoutes = {};
  private transformIndexHtml: (res: Response) => Promise<Response>;

  constructor(config: IBunServerAdapterConstructor) {
    this.options = config.options;
    this.serveOptions = config.serveOptions;
    this.appConfig = config.appConfig;
    this.assetsDependencyService = config.assetsDependencyService;
    this.scriptsBuilder = config.scriptsBuilder;
    this.router = config.router;
    this.fileSystemResponseMatcher = config.fileSystemResponseMatcher;
    this.transformIndexHtml = config.transformIndexHtml;
  }

  public async initialize() {
    appLogger.time('BunServerAdapter:initialize');
    this.setupLoaders();
    this.copyPublicDir();
    await this.initializePlugins();
    await this.buildScripts();
    await this.initRouter();
    this.collectRoutes();
    if (this.options.watch) await this.watch();
    appLogger.timeEnd('BunServerAdapter:initialize');
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
      scriptsBuilder: this.scriptsBuilder,
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
    for (const processor of this.appConfig.processors.values()) {
      await processor.setup();
      this.assetsDependencyService.registerDependencies({
        name: processor.getName(),
        getDependencies: () => processor.getDependencies(),
      });
    }

    for (const integration of this.appConfig.integrations) {
      integration.setConfig(this.appConfig);
      integration.setDependencyService(this.assetsDependencyService);
      await integration.setup();
      this.assetsDependencyService.registerDependencies({
        name: integration.name,
        getDependencies: () => integration.getDependencies(),
      });
    }
  }

  private async buildScripts() {
    await this.scriptsBuilder.build();
  }

  private async initRouter() {
    await this.router.init();
  }

  private collectRoutes() {
    for (const pathname of Object.keys(this.router.routes)) {
      this.routes[pathname] = async (req: Request) => this.handleResponse(req);
    }
  }

  private async handleResponse(req: Request) {
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

  public handleNoMatch(req: Request) {
    const pathname = new URL(req.url).pathname;
    return this.fileSystemResponseMatcher.handleNoMatch(pathname);
  }
}

export async function createBunServerAdapter({
  appConfig,
  serveOptions,
  options = { watch: false },
}: {
  appConfig: EcoPagesAppConfig;
  serveOptions: BunServeAdapterServerOptions;
  options?: { watch: boolean } | undefined;
}): Promise<BunServeOptions> {
  import.meta.env.NODE_ENV = 'development';

  const assetsDependencyService = new AssetsDependencyService({ appConfig });

  const htmlTransformer = new HtmlTransformerService();

  const scriptsBuilder = new ScriptsBuilder({ appConfig, options: { watchMode: options?.watch } });

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
    scriptsBuilder,
    router,
    fileSystemResponseMatcher,
    routeRendererFactory,
    transformIndexHtml,
  });

  await adapter.initialize();

  return adapter.buildServerSettings();
}
