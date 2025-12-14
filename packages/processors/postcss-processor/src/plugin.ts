/**
 * PostCssProcessorPlugin
 * @module @ecopages/postcss-processor
 */

import path from 'node:path';
import { bunInlineCssPlugin } from '@ecopages/bun-inline-css-plugin';
import { FileUtils } from '@ecopages/core';
import { Processor, type ProcessorConfig } from '@ecopages/core/plugins/processor';
import { Logger } from '@ecopages/logger';
import type { BunPlugin } from 'bun';
import type postcss from 'postcss';
import { defaultPlugins, type PluginsRecord } from './default-plugins';
import { getFileAsBuffer, PostCssProcessor } from './postcss-processor';

const logger = new Logger('[@ecopages/postcss-processor]', {
	debug: import.meta.env.ECOPAGES_LOGGER_DEBUG === 'true',
});

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
	 * @param contents The contents of the file
	 * @returns The transformed contents
	 */
	transformInput?: (contents: string | Buffer) => Promise<string>;
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

	private postcssPlugins: postcss.AcceptedPlugin[] = Object.values(defaultPlugins);

	constructor(
		config: Omit<ProcessorConfig<PostCssProcessorPluginConfig>, 'name' | 'description'> = {
			options: PostCssProcessorPlugin.DEFAULT_OPTIONS,
		},
	) {
		super({
			name: 'ecopages-postcss-processor',
			description: 'A Processor for transforming CSS files using PostCSS.',
			...config,
		});
	}

	get buildPlugins(): BunPlugin[] {
		const options = this.options;
		return [
			bunInlineCssPlugin({
				filter: this.options?.filter ?? PostCssProcessorPlugin.DEFAULT_OPTIONS.filter,
				namespace: 'bun-postcss-processor-build-plugin',
				transform: async (contents: string | Buffer) => {
					const transformedContents = options?.transformInput
						? await options.transformInput(contents)
						: contents;
					return await this.process(transformedContents as string);
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
						let text: Buffer<ArrayBufferLike> | string = getFileAsBuffer(args.path);

						if (options?.transformInput) {
							text = await options.transformInput(text);
						}

						const contents = await bindedInputProcessing(text as string);

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
			logger.debug('Using default PostCSS plugins.');
			this.postcssPlugins = Object.values(defaultPlugins);
		}

		if (!this.postcssPlugins || this.postcssPlugins.length === 0) {
			logger.warn('No PostCSS plugins configured or loaded. CSS processing might be minimal.');
			this.postcssPlugins = [];
		}
	}

	/**
	 * Get the content of a CSS file with the input header.
	 * @param filePath Path to the CSS file
	 * @returns Referenced content
	 */
	async process(fileAsString: string): Promise<string> {
		return await PostCssProcessor.processStringOrBuffer(fileAsString, {
			plugins: this.postcssPlugins,
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
