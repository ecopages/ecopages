import { postCssProcessorPlugin } from '@/plugins/postcss-processor.plugin';
import { appLogger } from '@/utils/app-logger';
import { FileUtils } from '@/utils/file-utils.module';
import type { EcoPagesConfig } from '@types';
import { PostCssProcessor } from './postcss-processor';

type ScriptsBuilderOptions = {
  watchMode: boolean;
};

export class ScriptsBuilder {
  config: EcoPagesConfig;
  options: ScriptsBuilderOptions;

  constructor({ config, options }: { config: EcoPagesConfig; options: { watchMode: boolean } }) {
    this.config = config;
    this.options = options;
  }

  async build() {
    const { srcDir, distDir, scriptsExtensions } = this.config;

    const scripts = FileUtils.glob(scriptsExtensions.map((ext) => `${srcDir}/**/*.${ext}`));

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
        postCssProcessorPlugin({
          transform: PostCssProcessor.processString,
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
