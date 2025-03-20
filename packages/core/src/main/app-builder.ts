import '../global/init.ts';
import path from 'node:path';
import type { Server } from 'bun';
import { Processor } from 'src/processors/processor.ts';
import { BunFileSystemServerAdapter, type CreateServerOptions } from '../adapters/bun/fs-server.ts';
import { StaticContentServer } from '../dev/sc-server.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { ScriptsBuilder } from '../main/scripts-builder.ts';
import type { CssParserService } from '../services/css-parser.service.ts';
import type { DependencyService, ProcessedDependency } from '../services/dependency.service.ts';
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
  private cssParser: CssParserService;
  private scriptsBuilder: ScriptsBuilder;
  private options: AppBuilderOptions;
  private dependencyService: DependencyService;
  private processedDependencies: ProcessedDependency[] = [];
  private htmlTransformer: HtmlTransformerService;

  constructor({
    appConfig,
    staticPageGenerator,
    cssParser,
    scriptsBuilder,
    options,
    dependencyService,
    htmlTransformer,
  }: {
    appConfig: EcoPagesAppConfig;
    staticPageGenerator: StaticPageGenerator;
    cssParser: CssParserService;
    scriptsBuilder: ScriptsBuilder;
    options: AppBuilderOptions;
    dependencyService: DependencyService;
    htmlTransformer: HtmlTransformerService;
  }) {
    this.appConfig = appConfig;
    this.staticPageGenerator = staticPageGenerator;
    this.cssParser = cssParser;
    this.scriptsBuilder = scriptsBuilder;
    this.options = options;
    this.dependencyService = dependencyService;
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

  private async execTailwind() {
    const { srcDir, distDir, tailwind } = this.appConfig;
    const input = `${srcDir}/${tailwind.input}`;
    const output = `${distDir}/${tailwind.input}`;
    const cssString = await this.cssParser.processor.processPath(input);
    FileUtils.ensureDirectoryExists(path.dirname(output));
    FileUtils.writeFileSync(output, cssString);
  }

  private async transformIndexHtml(res: Response): Promise<Response> {
    this.htmlTransformer.setProcessedDependencies(this.processedDependencies);
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
      cssBuilder: this.cssParser,
      scriptsBuilder: this.scriptsBuilder,
      router: dev.router,
      execTailwind: this.execTailwind.bind(this),
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

  private async initializeProcessors() {
    for (const processor of this.appConfig.processors.values()) {
      this.dependencyService.addProvider({
        name: processor.getName(),
        getDependencies: () => processor.getDependencies(),
      });

      await processor.setup();
    }
  }

  private async loadProcessedDependencies() {
    this.processedDependencies = await this.dependencyService.prepareDependencies();
  }

  async run() {
    const { distDir } = this.appConfig;

    this.prepareDistDir();

    this.copyPublicDir();

    await this.initializeProcessors();

    await this.loadProcessedDependencies();

    await this.execTailwind();

    await this.cssParser.build();

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
