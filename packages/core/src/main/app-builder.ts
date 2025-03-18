import '../global/init.ts';

import path from 'node:path';
import { PostCssProcessor } from '@ecopages/postcss-processor';
import { BunFileSystemServerAdapter, type CreateServerOptions } from '../adapters/bun/fs-server.ts';
import { StaticContentServer } from '../dev/sc-server.ts';
import { appLogger } from '../global/app-logger.ts';
import { CssBuilder } from '../main/css-builder.ts';
import { FileUtils } from '../utils/file-utils.module.ts';
import { ProjectWatcher } from './project-watcher.ts';

import type { Server } from 'bun';
import { Processor } from 'src/processors/processor.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { ScriptsBuilder } from '../main/scripts-builder.ts';
import type { DependencyService, ProcessedDependency } from './dependency-service.ts';
import type { StaticPageGenerator } from './static-page-generator.ts';

type AppBuilderOptions = {
  watch: boolean;
  serve: boolean;
  build: boolean;
};

export class AppBuilder {
  private appConfig: EcoPagesAppConfig;
  private staticPageGenerator: StaticPageGenerator;
  private cssBuilder: CssBuilder;
  private scriptsBuilder: ScriptsBuilder;
  private options: AppBuilderOptions;
  private dependencyService: DependencyService;
  private processedDependencies: ProcessedDependency[] = [];

  constructor({
    appConfig,
    staticPageGenerator,
    cssBuilder,
    scriptsBuilder,
    options,
    dependencyService,
  }: {
    appConfig: EcoPagesAppConfig;
    staticPageGenerator: StaticPageGenerator;
    cssBuilder: CssBuilder;
    scriptsBuilder: ScriptsBuilder;
    options: AppBuilderOptions;
    dependencyService: DependencyService;
  }) {
    this.appConfig = appConfig;
    this.staticPageGenerator = staticPageGenerator;
    this.cssBuilder = cssBuilder;
    this.scriptsBuilder = scriptsBuilder;
    this.options = options;
    this.dependencyService = dependencyService;
  }

  prepareDistDir() {
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

  copyPublicDir() {
    const { srcDir, publicDir, distDir } = this.appConfig;
    FileUtils.copyDirSync(path.join(srcDir, publicDir), path.join(distDir, publicDir));
  }

  async execTailwind() {
    const { srcDir, distDir, tailwind } = this.appConfig;
    const input = `${srcDir}/${tailwind.input}`;
    const output = `${distDir}/${tailwind.input}`;
    const cssString = await this.cssBuilder.processor.processPath(input);
    FileUtils.ensureDirectoryExists(path.dirname(output));
    FileUtils.writeFileSync(output, cssString);
  }

  private async transformIndexHtml(res: Response): Promise<Response> {
    const headDependencies = this.processedDependencies.filter((dep) => dep.position === 'head');
    const bodyDependencies = this.processedDependencies.filter((dep) => dep.position === 'body');

    function formatAttributes(attrs?: Record<string, string>): string {
      if (!attrs) return '';
      return ` ${Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ')}`;
    }

    const rewriter = new HTMLRewriter()
      .on('head', {
        element(element) {
          for (const dep of headDependencies) {
            if (dep.kind === 'script') {
              const script = dep.inline
                ? `<script${formatAttributes(dep.attributes)}>${dep.content}</script>`
                : `<script src="${dep.srcUrl}"${formatAttributes(dep.attributes)}></script>`;
              element.append(script, { html: true });
            } else if (dep.kind === 'stylesheet') {
              const style = dep.inline
                ? `<style${formatAttributes(dep.attributes)}>${dep.content}</style>`
                : `<link rel="stylesheet" href="${dep.srcUrl}"${formatAttributes(dep.attributes)}>`;
              element.append(style, { html: true });
            }
          }
        },
      })
      .on('body', {
        element(element) {
          for (const dep of bodyDependencies) {
            if (dep.kind === 'script') {
              const script = dep.inline
                ? `<script${formatAttributes(dep.attributes)}>${dep.content}</script>`
                : `<script src="${dep.srcUrl}"${formatAttributes(dep.attributes)}></script>`;
              element.append(script, { html: true });
            }
          }
        },
      });

    return rewriter.transform(res);
  }

  private async runDevServer() {
    const options = {
      appConfig: this.appConfig,
      options: { watchMode: this.options.watch },
      transformIndexHtml: this.transformIndexHtml.bind(this),
    } as CreateServerOptions;
    return await BunFileSystemServerAdapter.createServer(options);
  }

  async serve() {
    await this.runDevServer();
  }

  async watch() {
    const dev = await this.runDevServer();

    const watcherInstance = new ProjectWatcher({
      config: this.appConfig,
      cssBuilder: new CssBuilder({
        processor: PostCssProcessor,
        appConfig: this.appConfig,
      }),
      scriptsBuilder: this.scriptsBuilder,
      router: dev.router,
      execTailwind: this.execTailwind.bind(this),
    });

    await watcherInstance.createWatcherSubscription();
  }

  serveStatic() {
    const { server } = StaticContentServer.createServer({
      appConfig: this.appConfig,
    });

    appLogger.info(`Preview running at http://localhost:${(server as Server).port}`);
  }

  async buildStatic() {
    await this.staticPageGenerator.run();
    if (this.options.build) {
      appLogger.info('Build completed');
      process.exit(0);
    }

    this.serveStatic();
  }

  async run() {
    const { distDir } = this.appConfig;

    this.prepareDistDir();

    this.copyPublicDir();

    for (const processor of this.appConfig.processors.values()) {
      this.dependencyService.addProvider({
        name: processor.getName(),
        getDependencies: () => processor.getDependencies(),
      });

      await processor.setup();
    }

    this.processedDependencies = await this.dependencyService.prepareDependencies();

    await this.execTailwind();

    await this.cssBuilder.build();
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
