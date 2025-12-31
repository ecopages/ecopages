/**
 * PostCssProcessorPlugin
 * @module @ecopages/postcss-processor
 */

import path from 'node:path';
import { bunInlineCssPlugin } from '@ecopages/bun-inline-css-plugin';
import { ClientBridge, FileUtils } from '@ecopages/core';
import { Processor, type ProcessorConfig } from '@ecopages/core/plugins/processor';
import { Logger } from '@ecopages/logger';
import type { BunPlugin } from 'bun';
import type postcss from 'postcss';
import { getFileAsBuffer, PostCssProcessor } from './postcss-processor';

const logger = new Logger('[@ecopages/postcss-processor]', {
	debug: import.meta.env.ECOPAGES_LOGGER_DEBUG === 'true',
});

/**
 * Record of PostCSS plugins keyed by name
 */
export type PluginsRecord = Record<string, postcss.AcceptedPlugin>;

/**
 * Configuration for the PostCSS processor
 */
export interface PostCssProcessorPluginConfig {
	/**
	 * Regex filter to match files to process
	 */
	filter?: RegExp;
	/**
	 * Function to transform the contents of the file.
	 * It can be handy to add a custom header or footer to the file.
	 * Useful for injecting Tailwind v4 `@reference` directives.
	 * @param contents The contents of the file
	 * @param filePath The absolute path to the CSS file being processed
	 * @returns The transformed contents
	 */
	transformInput?: (contents: string | Buffer, filePath: string) => Promise<string>;
	/**
	 * Function to transform the output CSS after PostCSS processing.
	 * It can be handy to add a custom header or footer to the processed CSS.
	 * @param css The processed CSS
	 * @returns The transformed CSS
	 */
	transformOutput?: (css: string) => Promise<string> | string;
	/**
	 * Custom PostCSS plugins to use instead of the default ones
	 * @default undefined (uses default plugins)
	 */
	plugins?: PluginsRecord;
}

/**
 * PostCssProcessorPlugin
 * A Processor for transforming CSS files.
 */
export class PostCssProcessorPlugin extends Processor<PostCssProcessorPluginConfig> {
	static DEFAULT_OPTIONS: Required<Pick<PostCssProcessorPluginConfig, 'filter'>> = {
		filter: /\.css$/,
	};

	private postcssPlugins: postcss.AcceptedPlugin[] = [];

	constructor(
		config: Omit<ProcessorConfig<PostCssProcessorPluginConfig>, 'name' | 'description'> = {
			options: PostCssProcessorPlugin.DEFAULT_OPTIONS,
		},
	) {
		super({
			name: 'ecopages-postcss-processor',
			description: 'A Processor for transforming CSS files using PostCSS.',
			watch: {
				paths: [],
				extensions: ['.css', '.scss', '.sass', '.less'],
				onChange: async ({ path, bridge }) => {
					await this.handleCssChange(path, bridge);
				},
			},
			...config,
		});
	}

	/**
	 * Handles CSS file changes during development.
	 * Processes the file and broadcasts a css-update event for hot reloading.
	 */
	private async handleCssChange(filePath: string, bridge: ClientBridge): Promise<void> {
		if (!this.context) return;

		try {
			const relativePath = path.relative(this.context.srcDir, filePath);
			const outputPath = path.join(this.context.distDir, 'assets', relativePath);

			let content = await FileUtils.getFileAsString(filePath);

			if (this.options?.transformInput) {
				content = await this.options.transformInput(content, filePath);
			}

			const processed = await this.process(content, filePath);

			FileUtils.ensureDirectoryExists(path.dirname(outputPath));
			FileUtils.write(outputPath, processed);

			bridge.cssUpdate(filePath);

			logger.debug(`Processed CSS: ${filePath}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`Failed to process CSS: ${filePath}`, errorMessage);
			bridge.error(errorMessage);
		}
	}

	get buildPlugins(): BunPlugin[] {
		const options = this.options;
		return [
			bunInlineCssPlugin({
				filter: this.options?.filter ?? PostCssProcessorPlugin.DEFAULT_OPTIONS.filter,
				namespace: 'bun-postcss-processor-build-plugin',
				transform: async (contents: string | Buffer, args: { path: string }) => {
					let transformed: string =
						contents instanceof Buffer ? contents.toString('utf-8') : (contents as string);
					if (options?.transformInput) {
						transformed = await options.transformInput(contents, args.path);
					}
					return await this.process(transformed, args.path);
				},
			}),
		];
	}

	get plugins(): BunPlugin[] {
		const bindedInputProcessing = this.process.bind(this);
		const options = this.options;
		return [
			{
				name: 'bun-postcss-processor-plugin-loader',
				setup(build) {
					const postcssFilter = options?.filter ?? PostCssProcessorPlugin.DEFAULT_OPTIONS.filter;

					build.onLoad({ filter: postcssFilter }, async (args) => {
						let text: string = getFileAsBuffer(args.path).toString('utf-8');

						if (options?.transformInput) {
							text = await options.transformInput(text, args.path);
						}

						const contents = await bindedInputProcessing(text, args.path);

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
		await this.collectPostcssPlugins();
	}

	/**
	 * Get the PostCSS plugins from the options or a config file.
	 * Searches for postcss.config.{js,cjs,mjs,ts} in the root directory.
	 */
	private async collectPostcssPlugins(): Promise<void> {
		if (!this.context) {
			throw new Error('Context must be set');
		}

		const configExtensions = ['js', 'cjs', 'mjs', 'ts'];
		let foundConfigPath: string | undefined;
		let loadedPlugins: postcss.AcceptedPlugin[] | undefined;

		for (const ext of configExtensions) {
			const configPath = path.join(this.context.rootDir, `postcss.config.${ext}`);
			if (FileUtils.existsSync(configPath)) {
				foundConfigPath = configPath;
				break;
			}
		}

		if (foundConfigPath) {
			try {
				logger.debug(`Loading PostCSS config from: ${foundConfigPath}`);

				const postcssConfigModule = await import(foundConfigPath);
				const postcssConfig = postcssConfigModule.default || postcssConfigModule;

				if (postcssConfig && typeof postcssConfig.plugins === 'object' && postcssConfig.plugins !== null) {
					if (Array.isArray(postcssConfig.plugins)) {
						loadedPlugins = postcssConfig.plugins;
					} else {
						loadedPlugins = Object.values(postcssConfig.plugins as PluginsRecord);
					}
					logger.debug(`Successfully loaded ${loadedPlugins?.length ?? 0} plugins from config file.`);
				} else {
					logger.warn(
						`PostCSS config file found (${foundConfigPath}), but no valid 'plugins' export detected.`,
					);
				}
			} catch (error: any) {
				logger.error(`Error loading PostCSS config from ${foundConfigPath}: ${error.message}`, error);
				loadedPlugins = undefined;
			}
		} else {
			logger.debug('No PostCSS config file found in root directory.');
		}

		if (loadedPlugins) {
			this.postcssPlugins = loadedPlugins;
		} else if (this.options?.plugins) {
			logger.debug('Using PostCSS plugins provided in processor options.');
			this.postcssPlugins = Object.values(this.options.plugins);
		} else {
			logger.warn(
				'No PostCSS plugins configured. Use a preset like tailwindV3Preset() or tailwindV4Preset(), ' +
					'provide plugins via options, or create a postcss.config file.',
			);
			this.postcssPlugins = [];
		}

		if (!this.postcssPlugins || this.postcssPlugins.length === 0) {
			logger.warn('No PostCSS plugins configured or loaded. CSS processing might be minimal.');
			this.postcssPlugins = [];
		}
	}

	/**
	 * Process CSS content
	 * @param fileAsString CSS content as string
	 * @param filePath Optional file path for resolving relative imports
	 * @returns Processed CSS
	 */
	async process(fileAsString: string, filePath?: string): Promise<string> {
		return await PostCssProcessor.processStringOrBuffer(fileAsString, {
			filePath,
			plugins: this.postcssPlugins,
			transformOutput: this.options?.transformOutput,
		});
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
