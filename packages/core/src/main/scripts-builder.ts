import { bunInlineCssPlugin } from '@ecopages/bun-inline-css-plugin';
import { PostCssProcessor } from '@ecopages/postcss-processor';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import { FileUtils } from '../utils/file-utils.module.ts';

type ScriptsBuilderOptions = {
  watchMode: boolean;
};

export class ScriptsBuilder {
  config: EcoPagesAppConfig;
  options: ScriptsBuilderOptions;

  constructor({ config, options }: { config: EcoPagesAppConfig; options: { watchMode: boolean } }) {
    this.config = config;
    this.options = options;
  }

  async build() {
    const { srcDir, distDir, scriptsExtensions } = this.config;

    const scripts = await FileUtils.glob(scriptsExtensions.map((ext) => `${srcDir}/**/*${ext}`));

    appLogger.debug('Building scripts:', scripts);

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
          transform: PostCssProcessor.processStringOrBuffer,
        }),
      ],
    });

    if (!build.success) {
      for (const log of build.logs) {
        appLogger.debug(log);
      }
    }
  }
}
