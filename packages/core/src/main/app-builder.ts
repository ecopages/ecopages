import { exec } from 'node:child_process';
import path from 'node:path';

import 'src/global/init';

import { PostCssProcessor } from '@ecopages/postcss-processor';
import { BunFileSystemServerAdapter } from '../adapters/bun/fs-server.ts';
import { StaticContentServer } from '../dev/sc-server';
import { appLogger } from '../global/app-logger.ts';
import { CssBuilder } from '../main/css-builder.ts';
import { ProjectWatcher } from '../main/watcher.ts';
import { FileUtils } from '../utils/file-utils.module.ts';

import type { Server } from 'bun';
import type { IntegrationManager } from '../main/integration-manager.ts';
import type { ScriptsBuilder } from '../main/scripts-builder.ts';
import type { AppConfigurator } from './app-configurator.ts';
import type { StaticPageGenerator } from './static-page-generator.ts';

type AppBuilderOptions = {
  watch: boolean;
  serve: boolean;
  build: boolean;
};

export class AppBuilder {
  appConfigurator: AppConfigurator;
  integrationManger: IntegrationManager;
  staticPageGenerator: StaticPageGenerator;
  cssBuilder: CssBuilder;
  scriptsBuilder: ScriptsBuilder;
  options: AppBuilderOptions;

  constructor({
    appConfigurator,
    integrationManger,
    staticPageGenerator,
    cssBuilder,
    scriptsBuilder,
    options,
  }: {
    appConfigurator: AppConfigurator;
    integrationManger: IntegrationManager;
    staticPageGenerator: StaticPageGenerator;
    cssBuilder: CssBuilder;
    scriptsBuilder: ScriptsBuilder;
    options: AppBuilderOptions;
  }) {
    this.appConfigurator = appConfigurator;
    this.integrationManger = integrationManger;
    this.staticPageGenerator = staticPageGenerator;
    this.cssBuilder = cssBuilder;
    this.scriptsBuilder = scriptsBuilder;
    this.options = options;
  }

  prepareDistDir() {
    FileUtils.ensureFolderExists(this.appConfigurator.config.distDir, true);
  }

  copyPublicDir() {
    const { srcDir, publicDir, distDir } = this.appConfigurator.config;
    FileUtils.copyDirSync(path.join(srcDir, publicDir), path.join(distDir, publicDir));
  }

  execTailwind() {
    const { srcDir, distDir, tailwind } = this.appConfigurator.config;
    const input = `${srcDir}/${tailwind.input}`;
    const output = `${distDir}/${tailwind.input}`;
    const watch = this.options.watch;
    const minify = !watch;
    exec(`bunx tailwindcss -i ${input} -o ${output} ${watch ? '--watch' : ''} ${minify ? '--minify' : ''}`);
  }
  private async runDevServer() {
    const options = {
      appConfig: this.appConfigurator.config,
      options: { watchMode: this.options.watch },
    };
    await BunFileSystemServerAdapter.createServer(options);
  }

  async serve() {
    await this.runDevServer();
  }

  async watch() {
    this.runDevServer();

    const cssBuilder = new CssBuilder({
      processor: PostCssProcessor,
      appConfig: this.appConfigurator.config,
    });

    const watcherInstance = new ProjectWatcher(this.appConfigurator.config, cssBuilder, this.scriptsBuilder);
    await watcherInstance.createWatcherSubscription();
  }

  serveStatic() {
    const { server } = StaticContentServer.createServer({
      appConfig: this.appConfigurator.config,
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
    const { distDir } = this.appConfigurator.config;

    this.prepareDistDir();
    this.copyPublicDir();

    this.execTailwind();

    await this.cssBuilder.build();
    await this.scriptsBuilder.build();
    await this.integrationManger.prepareDependencies();

    this.appConfigurator.registerIntegrationsDependencies(this.integrationManger.dependencies);

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
