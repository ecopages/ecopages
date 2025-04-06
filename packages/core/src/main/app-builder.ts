import '../global/init.ts';
import path from 'node:path';
import type { Server } from 'bun';
import { BunFileSystemServerAdapter, type CreateServerOptions } from '../adapters/bun/fs-server.ts';
import { StaticContentServer } from '../dev/sc-server.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { ScriptsBuilder } from '../main/scripts-builder.ts';
import { Processor } from '../plugins/processor.ts';
import type { AssetsDependencyService } from '../services/assets-dependency.service.ts';
import type { HtmlTransformerService } from '../services/html-transformer.service';
import { FileUtils } from '../utils/file-utils.module.ts';
import { ProjectWatcher } from './project-watcher.ts';
import type { StaticPageGenerator } from './static-page-generator.ts';

type AppBuilderOptions = {
  watch: boolean;
  serve: boolean;
  build: boolean;
};

export class AppBuilder {
  private appConfig: EcoPagesAppConfig;
  private staticPageGenerator: StaticPageGenerator;
  private scriptsBuilder: ScriptsBuilder;
  private options: AppBuilderOptions;
  private assetsDependencyService: AssetsDependencyService;
  private htmlTransformer: HtmlTransformerService;

  constructor({
    appConfig,
    staticPageGenerator,
    scriptsBuilder,
    options,
    assetsDependencyService,
    htmlTransformer,
  }: {
    appConfig: EcoPagesAppConfig;
    staticPageGenerator: StaticPageGenerator;
    scriptsBuilder: ScriptsBuilder;
    options: AppBuilderOptions;
    assetsDependencyService: AssetsDependencyService;
    htmlTransformer: HtmlTransformerService;
  }) {
    this.appConfig = appConfig;
    this.staticPageGenerator = staticPageGenerator;
    this.scriptsBuilder = scriptsBuilder;
    this.options = options;
    this.assetsDependencyService = assetsDependencyService;
    this.htmlTransformer = htmlTransformer;
  }

  private prepareDistDir() {
    const distDir = this.appConfig.absolutePaths.distDir;
    const cacheDir = path.join(distDir, Processor.CACHE_DIR);

    let cacheContent: string[] = [];
    if (FileUtils.existsSync(cacheDir)) {
      cacheContent = FileUtils.readdirSync(cacheDir);
    }

    FileUtils.ensureDirectoryExists(distDir, true);

    if (cacheContent.length > 0) {
      FileUtils.mkdirSync(cacheDir);
      for (const item of cacheContent) {
        const itemPath = path.join(cacheDir, item);
        const targetPath = path.join(cacheDir, item);
        if (FileUtils.existsSync(itemPath)) {
          if (FileUtils.isDirectory(itemPath)) {
            FileUtils.copyDirSync(itemPath, targetPath);
          } else {
            FileUtils.copyFileSync(itemPath, targetPath);
          }
        }
      }
    }
  }

  private copyPublicDir() {
    const { srcDir, publicDir, distDir } = this.appConfig;
    FileUtils.copyDirSync(path.join(srcDir, publicDir), path.join(distDir, publicDir));
  }

  private async transformIndexHtml(res: Response): Promise<Response> {
    const dependencies = await this.assetsDependencyService.prepareDependencies();
    this.htmlTransformer.setProcessedDependencies(dependencies);
    return this.htmlTransformer.transform(res);
  }

  private async runDevServer() {
    const options = {
      appConfig: this.appConfig,
      options: { watchMode: this.options.watch },
      transformIndexHtml: this.transformIndexHtml.bind(this),
    } as CreateServerOptions;
    return await BunFileSystemServerAdapter.createServer(options);
  }

  private async serve() {
    await this.runDevServer();
  }

  private async watch() {
    const dev = await this.runDevServer();

    const watcherInstance = new ProjectWatcher({
      config: this.appConfig,
      scriptsBuilder: this.scriptsBuilder,
      router: dev.router,
    });

    await watcherInstance.createWatcherSubscription();
  }

  private serveStatic() {
    const { server } = StaticContentServer.createServer({
      appConfig: this.appConfig,
    });

    appLogger.info(`Preview running at http://localhost:${(server as Server).port}`);
  }

  async buildStatic() {
    await this.staticPageGenerator.run({
      transformIndexHtml: this.transformIndexHtml.bind(this),
    });
    if (this.options.build) {
      appLogger.info('Build completed');
      process.exit(0);
    }

    this.serveStatic();
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

  private setupLoaders() {
    const loaders = this.appConfig.loaders;
    for (const loader of loaders.values()) {
      Bun.plugin(loader);
    }
  }

  async run() {
    const { distDir } = this.appConfig;

    this.setupLoaders();

    this.prepareDistDir();
    this.copyPublicDir();

    await this.initializePlugins();
    await this.scriptsBuilder.build();

    if (this.options.watch) {
      return await this.watch();
    }

    FileUtils.gzipDirSync(distDir, ['css', 'js']);

    if (this.options.serve) {
      return await this.serve();
    }

    return await this.buildStatic();
  }
}
