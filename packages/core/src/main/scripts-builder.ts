import { bunInlineCssPlugin } from '@ecopages/bun-inline-css-plugin';
import { PostCssProcessor } from '@ecopages/postcss-processor';
import type { BunPlugin } from 'bun';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { CssProcessor } from '../public-types.ts';
import { FileUtils } from '../utils/file-utils.module.ts';

type ScriptsBuilderOptions = {
  watchMode: boolean;
};

export class ScriptsBuilder {
  appConfig: EcoPagesAppConfig;
  options: ScriptsBuilderOptions;
  cssProcessor: CssProcessor;

  constructor({
    appConfig,
    options,
    cssProcessor = PostCssProcessor,
  }: {
    appConfig: EcoPagesAppConfig;
    options: { watchMode: boolean };
    cssProcessor?: CssProcessor;
  }) {
    this.appConfig = appConfig;
    this.options = options;
    this.cssProcessor = cssProcessor;
  }

  private collectBuildPlugins(): BunPlugin[] {
    const plugins: BunPlugin[] = [];

    for (const processor of this.appConfig.processors.values()) {
      if (processor.buildPlugin) {
        plugins.push(processor.buildPlugin.createBuildPlugin());
      }
    }

    return plugins;
  }

  async build() {
    const { srcDir, distDir, scriptsExtensions } = this.appConfig;

    const scripts = await FileUtils.glob(scriptsExtensions.map((ext) => `${srcDir}/**/*${ext}`));

    if (!scripts.length) {
      appLogger.debug('No scripts to build.', { scripts, scriptsExtensions });
      return;
    }

    const build = await Bun.build({
      entrypoints: scripts,
      outdir: distDir,
      root: srcDir,
      target: 'browser',
      minify: !this.options.watchMode,
      format: 'esm',
      splitting: true,
      plugins: [
        bunInlineCssPlugin({
          transform: (content) => this.cssProcessor.processStringOrBuffer(content),
        }),
        ...this.collectBuildPlugins(),
      ],
    });

    if (!build.success) {
      for (const log of build.logs) {
        appLogger.debug(log);
      }
    }
  }
}
