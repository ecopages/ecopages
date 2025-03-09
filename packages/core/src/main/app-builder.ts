import '../global/init.ts';

import path from 'node:path';
import { PostCssProcessor } from '@ecopages/postcss-processor';
import { BunFileSystemServerAdapter } from '../adapters/bun/fs-server.ts';
import { StaticContentServer } from '../dev/sc-server.ts';
import { appLogger } from '../global/app-logger.ts';
import { CssBuilder } from '../main/css-builder.ts';
import { FileUtils } from '../utils/file-utils.module.ts';
import { ProjectWatcher } from './project-watcher.ts';

import type { Server } from 'bun';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { ScriptsBuilder } from '../main/scripts-builder.ts';
import type { StaticPageGenerator } from './static-page-generator.ts';

type AppBuilderOptions = {
  watch: boolean;
  serve: boolean;
  build: boolean;
};

export class AppBuilder {
  appConfig: EcoPagesAppConfig;
  staticPageGenerator: StaticPageGenerator;
  cssBuilder: CssBuilder;
  scriptsBuilder: ScriptsBuilder;
  options: AppBuilderOptions;

  constructor({
    appConfig,
    staticPageGenerator,
    cssBuilder,
    scriptsBuilder,
    options,
  }: {
    appConfig: EcoPagesAppConfig;
    staticPageGenerator: StaticPageGenerator;
    cssBuilder: CssBuilder;
    scriptsBuilder: ScriptsBuilder;
    options: AppBuilderOptions;
  }) {
    this.appConfig = appConfig;
    this.staticPageGenerator = staticPageGenerator;
    this.cssBuilder = cssBuilder;
    this.scriptsBuilder = scriptsBuilder;
    this.options = options;
  }

  prepareDistDir() {
    FileUtils.ensureDirectoryExists(this.appConfig.distDir, true);
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

  async optimizeImages() {
    if (!this.appConfig.imageOptimization || this.appConfig.imageOptimization.enabled !== true) return;

    if (!this.appConfig.imageOptimization.processor) {
      appLogger.warn('Image optimization processor is not configured');
      return;
    }

    await this.appConfig.imageOptimization.processor.processDirectory();
  }

  private async runDevServer() {
    const options = {
      appConfig: this.appConfig,
      options: { watchMode: this.options.watch },
    };
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

    await this.optimizeImages();

    this.copyPublicDir();

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
