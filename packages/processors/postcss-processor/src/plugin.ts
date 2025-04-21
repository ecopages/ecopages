/**
 * PostCssProcessorPlugin
 * @module @ecopages/postcss-processor
 */

import path from 'node:path';
import { bunInlineCssPlugin } from '@ecopages/bun-inline-css-plugin';
import { FileUtils, deepMerge } from '@ecopages/core';
import { Processor, type ProcessorConfig, type ProcessorWatchConfig } from '@ecopages/core/plugins/processor';
import { type AssetDependency, AssetDependencyHelpers } from '@ecopages/core/services/assets-dependency-service';
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

  static EXTENSIONS_TO_WATCH = ['css', 'jsx', 'tsx', 'js', 'ts', 'html'];

  constructor(config: Omit<ProcessorConfig<PostCssProcessorPluginConfig>, 'name' | 'description'>) {
    const defaultWatchConfig: ProcessorWatchConfig = {
      paths: [],
      /**
       * @todo should use the appConfig extensions from integrations
       */
      extensions: ['css', 'jsx', 'tsx', 'js', 'ts', 'html'],
      onCreate: async (filePath: string) => {
        if (filePath.endsWith('.css')) {
          await this.processCssFile(filePath);
        }
      },
      onChange: async (filePath) => {
        if (filePath.endsWith('.css')) {
          await this.processCssFile(filePath);
        }

        if (
          PostCssProcessorPlugin.EXTENSIONS_TO_WATCH.some((ext) => filePath.endsWith(ext)) &&
          this.options?.processTailwind
        ) {
          await this.execTailwind();
        }
      },
      onDelete: async (filePath) => {
        if (filePath.endsWith('.css')) {
          await this.deleteProcessedCssFile(filePath);
        }
      },
      onError: (error) => logger.error('Watcher error', { error }),
    };

    super({
      ...(config ?? PostCssProcessorPlugin.DEFAULT_OPTIONS),
      name: 'ecopages-postcss-processor',
      description: 'A Processor for transforming CSS files using PostCSS.',
      watch: config.watch ? deepMerge(defaultWatchConfig, config.watch) : defaultWatchConfig,
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
   * Generate dependencies for processor.
   * It is possible to define which ones should be included in the final bundle based on the environment.
   */
  private generateDependencies(): AssetDependency[] {
    const deps: AssetDependency[] = [];

    if (import.meta.env.NODE_ENV === 'development') {
      /**
       * Here we can define the dependencies for the development environment
       * @example
       * deps.push(
       *   AssetDependencyHelpers.createInlineScriptAsset({
       *     content: `document.addEventListener("DOMContentLoaded",() => console.log("[@ecopages/image-processor] Processor is loaded"));`,
       *     attributes: {
       *       type: 'module',
       *     },
       *   }),
       * );
       */
    }

    return deps;
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

    logger.debug('PostCssProcessor config', { config: this.options });

    if (this.watchConfig) {
      this.watchConfig.paths = [this.options.sourceDir ?? this.context.srcDir];
    }

    this.dependencies = this.generateDependencies();

    logger.debugTime('PostCssProcessor setup time');

    await this.processAll();

    if (this.options.processTailwind) {
      this.execTailwind();
    }

    logger.debugTimeEnd('PostCssProcessor setup time');
  }

  private async execTailwind(): Promise<void> {
    if (!this.options || !this.context) {
      throw new Error('Options and context must be set');
    }

    const { processTailwind, tailwindInput } = this.options;
    if (!processTailwind || !tailwindInput) return;

    const input = path.join(this.options.sourceDir ?? this.context.srcDir, tailwindInput);
    const output = path.join(this.options.outputDir ?? this.context.distDir, tailwindInput);

    FileUtils.ensureDirectoryExists(path.dirname(output));

    this.processCssFile(input).catch((error) => {
      logger.error('Failed to process Tailwind CSS', { error });
    });
  }

  /**
   * Process CSS files.
   * @param files Array of file paths to process
   */
  async process(files: string[]): Promise<void> {
    logger.debug('Processing CSS files', { count: files.length });

    for (const file of files) {
      try {
        await this.processCssFile(file);
      } catch (error) {
        logger.error('Failed to process CSS file', { file, error });
      }
    }
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
   * Process a single CSS file.
   * @param filePath Path to the CSS file
   */
  private async processCssFile(filePath: string): Promise<void> {
    if (!this.options || !this.context) {
      throw new Error('Options not set');
    }

    try {
      const fileAsString = getFileAsBuffer(filePath);
      const content = await this.buildInputToProcess(fileAsString.toString());
      const outputPath = this.getOutputPath(filePath);

      FileUtils.ensureDirectoryExists(path.dirname(outputPath));
      FileUtils.writeFileSync(outputPath, content);
    } catch (error) {
      logger.error('Failed to process CSS file', { path: filePath, error });
    }
  }

  /**
   * Delete processed CSS file.
   * @param filePath Path to the original CSS file
   */
  private async deleteProcessedCssFile(filePath: string): Promise<void> {
    logger.debug('Deleting processed CSS file', filePath);

    try {
      const outputPath = this.getOutputPath(filePath);

      if (FileUtils.existsSync(outputPath)) {
        await FileUtils.rmAsync(outputPath);
        logger.debug('Deleted processed CSS file', { file: outputPath });
      }
    } catch (error) {
      logger.error('Failed to delete processed CSS file', { path: filePath, error });
    }
  }

  /**
   * Get the output path for a processed CSS file.
   * @param filePath Path to the original CSS file
   * @returns Path to the processed CSS file
   */
  private getOutputPath(filePath: string): string {
    if (!this.context || !this.options) {
      throw new Error('Options and context must be set');
    }

    const relativePath = path.relative(this.options?.sourceDir ?? this.context.srcDir, filePath);
    const assetsDir = this.getAssetsDir();

    return path.join(assetsDir, relativePath);
  }

  /**
   * Get the assets directory path.
   * @returns Path to the assets directory
   */
  private getAssetsDir(): string {
    if (!this.context) {
      throw new Error('Context must be set');
    }
    return path.join(this.context.distDir, AssetDependencyHelpers.RESOLVED_ASSETS_DIR);
  }

  /**
   * Process all CSS files in the source directory.
   */
  async processAll(): Promise<void> {
    if (!this.options) {
      throw new Error('Options not set');
    }

    logger.debug('Processing all CSS files');

    try {
      const files = await FileUtils.glob([`${this.options.sourceDir}/**/*.css`]);
      await this.process(files);
      logger.debug(`Processed ${files.length} CSS files`);
    } catch (error) {
      logger.error('Failed to process all CSS files', { error });
    }
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
