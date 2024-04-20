import { exec } from 'node:child_process';
import path from 'node:path';

import '@/global/console';
import '@/global/utils';

import { CssBuilder } from '@/build/css-builder';
import { PostCssProcessor } from '@/build/postcss-processor';
import { ProjectWatcher } from '@/build/watcher';
import { FileSystemServer } from '@/server/fs-server';
import { StaticContentServer } from '@/server/sc-server';
import { appLogger } from '@/utils/app-logger';
import { FileUtils } from '@/utils/file-utils.module';

import type { ScriptsBuilder } from '@/build/scripts-builder';
import type { EcoPagesConfig } from '@types';
import type { Server } from 'bun';
import type { StaticPageGenerator } from './static-page-generator';

type AppBuilderOptions = {
  watch: boolean;
  serve: boolean;
  build: boolean;
};

export class AppBuilder {
  config: EcoPagesConfig;
  staticPageGenerator: StaticPageGenerator;
  cssBuilder: CssBuilder;
  scriptsBuilder: ScriptsBuilder;
  options: AppBuilderOptions;

  constructor({
    config,
    staticPageGenerator,
    cssBuilder,
    scriptsBuilder,
    options,
  }: {
    config: EcoPagesConfig;
    staticPageGenerator: StaticPageGenerator;
    cssBuilder: CssBuilder;
    scriptsBuilder: ScriptsBuilder;
    options: AppBuilderOptions;
  }) {
    this.config = config;
    this.staticPageGenerator = staticPageGenerator;
    this.cssBuilder = cssBuilder;
    this.scriptsBuilder = scriptsBuilder;
    this.options = options;
  }

  prepareDistDir() {
    FileUtils.ensureFolderExists(this.config.distDir, true);
  }

  copyPublicDir() {
    const { srcDir, publicDir, distDir } = this.config;
    FileUtils.copyDirSync(path.join(srcDir, publicDir), path.join(distDir, publicDir));
  }

  execTailwind() {
    const { srcDir, distDir, tailwind } = this.config;
    const input = `${srcDir}/${tailwind.input}`;
    const output = `${distDir}/${tailwind.input}`;
    const watch = this.options.watch;
    const minify = !watch;
    exec(`bunx tailwindcss -i ${input} -o ${output} ${watch ? '--watch' : ''} ${minify ? '--minify' : ''}`);
  }

  private async runDevServer() {
    const { server } = await FileSystemServer.create({
      watchMode: this.options.watch,
    });
    appLogger.info(`Server running at http://localhost:${server.port}`);
  }

  async serve() {
    await this.runDevServer();
  }

  async watch() {
    this.runDevServer();

    const cssBuilder = new CssBuilder({
      processor: PostCssProcessor,
      config: this.config,
    });

    const watcherInstance = new ProjectWatcher(cssBuilder, this.scriptsBuilder);
    const subscription = await watcherInstance.createWatcherSubscription();

    process.on('SIGINT', async () => {
      await subscription.unsubscribe();
      process.exit(0);
    });
  }

  async buildStatic() {
    await this.staticPageGenerator.run();
    if (this.options.build) {
      appLogger.info('Build completed');
      process.exit(0);
    }

    const { server } = StaticContentServer.create({
      watchMode: this.options.watch,
    });

    appLogger.info(`Preview running at http://localhost:${(server as Server).port}`);
  }

  async run() {
    const { srcDir, distDir, tailwind } = this.config;

    this.prepareDistDir();
    this.copyPublicDir();

    this.execTailwind();

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
