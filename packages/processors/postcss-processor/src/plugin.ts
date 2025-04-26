/**
 * PostCssProcessorPlugin
 * @module @ecopages/postcss-processor
 */

import { bunInlineCssPlugin } from '@ecopages/bun-inline-css-plugin';
import { deepMerge } from '@ecopages/core';
import { Processor, type ProcessorConfig } from '@ecopages/core/plugins/processor';
import { AssetDependencyHelpers } from '@ecopages/core/services/assets-dependency-service';
import { Logger } from '@ecopages/logger';
import type { BunPlugin } from 'bun';
import { type PluginsRecord, defaultPlugins } from './default-plugins';
import { PostCssProcessor, getFileAsBuffer } from './postcss-processor';

const logger = new Logger('[@ecopages/postcss-processor]', {
  debug: import.meta.env.ECOPAGES_LOGGER_DEBUG === 'true',
});

/**
 * Configuration for the PostCSS processor
 */
export interface PostCssProcessorPluginConfig {
  /**
   * Source directory for CSS files
   * @default '/src'
   */
  sourceDir?: string;

  /**
   * Output directory for processed CSS files
   * @default '/.eco'
   */
  outputDir?: string;

  /**
   * Custom PostCSS plugins to use instead of the default ones
   * @default undefined (uses default plugins)
   */
  plugins?: PluginsRecord;

  /**
   * Whether to process Tailwind CSS
   * @default true
   */
  processTailwind?: boolean;

  /**
   * Input file for Tailwind CSS relative to sourceDir
   * @default 'styles/tailwind.css'
   */
  tailwindInput?: string;

  /**
   * Input header for the PostCSS loader
   */
  inputHeader?: string;
}

/**
 * PostCssProcessorPlugin
 * A Processor for transforming CSS files.
 */
export class PostCssProcessorPlugin extends Processor<PostCssProcessorPluginConfig> {
  static DEFAULT_OPTIONS: PostCssProcessorPluginConfig = {
    sourceDir: 'src',
    outputDir: `.eco/${AssetDependencyHelpers.RESOLVED_ASSETS_DIR}`,
    processTailwind: true,
    tailwindInput: 'styles/tailwind.css',
  };

  constructor(config: Omit<ProcessorConfig<PostCssProcessorPluginConfig>, 'name' | 'description'>) {
    super({
      ...(config ?? PostCssProcessorPlugin.DEFAULT_OPTIONS),
      name: 'ecopages-postcss-processor',
      description: 'A Processor for transforming CSS files using PostCSS.',
    });
  }

  get buildPlugins(): BunPlugin[] {
    return [
      bunInlineCssPlugin({
        filter: /\.css$/,
        namespace: 'bun-postcss-processor-build-plugin',
        inputHeader: this.options?.inputHeader,
        transform: async (contents: string | Buffer) => {
          return await this.buildInputToProcess(contents.toString());
        },
      }),
    ];
  }

  get plugins(): BunPlugin[] {
    const bindedInputProcessing = this.buildInputToProcess.bind(this);
    return [
      {
        name: 'bun-postcss-processor-plugin-loader',
        setup(build) {
          const postcssFilter = /\.css/;

          build.onLoad({ filter: postcssFilter }, async (args) => {
            const text = getFileAsBuffer(args.path);
            const contents = await bindedInputProcessing(text.toString());
            return {
              contents,
              exports: { default: contents },
              loader: 'object',
            };
          });
        },
      },
    ];
  }

  /**
   * Setup the PostCSS processor.
   */
  async setup(): Promise<void> {
    if (!this.context) {
      throw new Error('PostCssProcessor requires context to be set');
    }

    const defaultConfig: PostCssProcessorPluginConfig = {
      sourceDir: `${this.context.srcDir}`,
      outputDir: `${this.context.distDir}/${AssetDependencyHelpers.RESOLVED_ASSETS_DIR}`,
      processTailwind: true,
      tailwindInput: 'styles/tailwind.css',
    };

    this.options = this.options ? deepMerge(defaultConfig, this.options) : defaultConfig;
  }

  /**
   * Get the content of a CSS file with the input header.
   * @param filePath Path to the CSS file
   * @returns Referenced content
   */
  private async buildInputToProcess(fileAsString: string): Promise<string> {
    if (!this.options || !this.context) {
      throw new Error('Options and context must be set');
    }

    let stringToProcess = fileAsString;

    if (this.options.inputHeader) {
      stringToProcess = `${this.options.inputHeader}\n${stringToProcess}`;
    }

    const plugins = Object.values(this.options.plugins ?? defaultPlugins);

    return await PostCssProcessor.processStringOrBuffer(stringToProcess, { plugins });
  }

  /**
   * Teardown the PostCSS processor.
   */
  async teardown(): Promise<void> {
    logger.debug('Tearing down PostCSS processor');
  }
}

export const postcssProcessorPlugin = (config?: PostCssProcessorPluginConfig): PostCssProcessorPlugin => {
  return new PostCssProcessorPlugin({
    options: config,
  });
};
