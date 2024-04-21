import { bunPluginInlineImport } from '@/plugins/plugin-inline-import';
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
    const { srcDir, distDir, scriptDescriptor } = this.config;

    const scripts = await FileUtils.glob(`${srcDir}/**/*.${scriptDescriptor}.{ts,tsx}`, { cwd: '.' });

    const build = await Bun.build({
      entrypoints: scripts,
      outdir: distDir,
      root: srcDir,
      target: 'browser',
      minify: !this.options.watchMode,
      format: 'esm',
      splitting: true,
      // plugins: [bunPluginInlineImport({ filter: /\.shadow.css$/, transform: PostCssProcessor.processString })],
    });

    if (!build.success) {
      for (const log of build.logs) {
        appLogger.debug(log);
      }
    }
  }
}
