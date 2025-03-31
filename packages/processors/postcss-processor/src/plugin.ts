/**
 * PostCssProcessorPlugin
 * @module @ecopages/postcss-processor
 */

import path from 'node:path';
import { FileUtils, deepMerge } from '@ecopages/core';
import {
  Processor,
  type ProcessorBuildPlugin,
  type ProcessorConfig,
  type ProcessorWatchConfig,
} from '@ecopages/core/plugins/processor';
import { type AssetDependency, AssetDependencyHelpers } from '@ecopages/core/services/assets-dependency-service';
import { Logger } from '@ecopages/logger';
import { type PluginsRecord, defaultPlugins } from './default-plugins';
import { PostCssProcessor } from './postcss-processor';

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
}

/**
 * PostCssProcessorPlugin
 * A Processor for transforming CSS files.
 */
export class PostCssProcessorPlugin extends Processor<PostCssProcessorPluginConfig> {
  static DEFAULT_OPTIONS: PostCssProcessorPluginConfig = {
    sourceDir: 'src',
    outputDir: '.eco',
    processTailwind: true,
    tailwindInput: 'styles/tailwind.css',
  };

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
        } else if (config.options?.processTailwind !== false) {
          await this.execTailwind();
        }
      },
      onChange: async (filePath) => {
        if (filePath.endsWith('.css')) {
          await this.processCssFile(filePath);
        } else if (config.options?.processTailwind !== false) {
          await this.execTailwind();
        }
      },
      onDelete: async (filePath) => {
        if (filePath.endsWith('.css')) {
          await this.deleteProcessedCssFile(filePath);
        } else if (config.options?.processTailwind !== false) {
          await this.execTailwind();
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

  get buildPlugin(): ProcessorBuildPlugin | undefined {
    return undefined;
  }

  /**
   * Generate dependencies for processor.
   * It is possible to define which ones should be included in the final bundle based on the environment.
   */
  private generateDependencies(): AssetDependency[] {
    const deps: AssetDependency[] = [];

    if (import.meta.env.NODE_ENV === 'development') {
      deps.push(
        AssetDependencyHelpers.createInlineScriptAsset({
          content: `document.addEventListener("DOMContentLoaded",() => console.log("[@ecopages/postcss-processor] Processor is loaded"));`,
          attributes: {
            type: 'module',
          },
        }),
      );
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
      outputDir: `${this.context.distDir}`,
      processTailwind: true,
      tailwindInput: 'styles/tailwind.css',
    };

    this.options = this.options ? deepMerge(defaultConfig, this.options) : defaultConfig;

    logger.debug('PostCssProcessor config', { config: this.options });

    if (this.watchConfig) {
      this.watchConfig.paths = [this.options.sourceDir ?? this.context.srcDir];
    }

    this.dependencies = this.generateDependencies();

    logger.time('PostCssProcessor setup time');

    await this.processAll();

    if (this.options.processTailwind) {
      await this.execTailwind();
    }

    logger.debug('PostCssProcessor setup time', {
      time: logger.timeEnd('PostCssProcessor setup time'),
    });
  }

  private async execTailwind(): Promise<void> {
    if (!this.options || !this.context) {
      throw new Error('Options and context must be set');
    }

    const { processTailwind, tailwindInput } = this.options;

    if (!processTailwind || !tailwindInput) return;

    const input = path.join(this.options.sourceDir ?? this.context.srcDir, tailwindInput);

    const output = path.join(this.options.outputDir ?? this.context.distDir, tailwindInput);

    logger.debug('Processing Tailwind CSS', { input, output });

    try {
      const content = await PostCssProcessor.processPath(input, {
        plugins: Object.values(this.options.plugins ?? defaultPlugins),
      });

      FileUtils.ensureDirectoryExists(path.dirname(output));
      FileUtils.writeFileSync(output, content);

      logger.debug('Processed Tailwind CSS', { output });
    } catch (error) {
      logger.error('Failed to process Tailwind CSS', { error });
    }
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
   * Process a single CSS file.
   * @param filePath Path to the CSS file
   */
  private async processCssFile(filePath: string): Promise<void> {
    if (!this.options) {
      throw new Error('Options not set');
    }

    try {
      const content = await PostCssProcessor.processPath(filePath, {
        plugins: Object.values(this.options.plugins ?? defaultPlugins),
      });

      const outputPath = this.getOutputPath(filePath);
      FileUtils.ensureDirectoryExists(path.dirname(outputPath));
      FileUtils.writeFileSync(outputPath, content);

      logger.debug('Processed CSS file', {
        source: filePath,
        output: outputPath,
      });
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
    if (!this.context) {
      throw new Error('Options and context must be set');
    }

    const relativePath = path.relative(this.options?.sourceDir ?? this.context.srcDir, filePath);
    return path.join(this.options?.outputDir ?? this.context.distDir, relativePath);
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
      logger.info(`Processed ${files.length} CSS files`);
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
