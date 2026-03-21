/**
 * PostCssProcessorPlugin
 * @module @ecopages/postcss-processor
 */

import path from 'node:path';
import type { IClientBridge } from '@ecopages/core';
import { fileSystem } from '@ecopages/file-system';
import { Processor, type ProcessorConfig } from '@ecopages/core/plugins/processor';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import { Logger } from '@ecopages/logger';
import type postcss from 'postcss';
import { PostCssProcessor } from './postcss-processor';
import { createCssLoaderPlugin } from './runtime/css-loader-plugin';
import type { CssTransformInput } from './runtime/css-runtime-contract';

const logger = new Logger('[@ecopages/postcss-processor]', {
	debug: process.env.ECOPAGES_LOGGER_DEBUG === 'true',
});

/**
 * Record of PostCSS plugins keyed by name
 */
export type PluginsRecord = Record<string, postcss.AcceptedPlugin>;

/**
 * Lazily creates PostCSS plugins.
 *
 * This is primarily used in development when a non-CSS file change forces the
 * processor to rebuild tracked stylesheets. Some plugins, including Tailwind,
 * keep internal caches in long-lived plugin instances, so recreating them is
 * required to pick up newly discovered classes.
 */
export type PluginFactoryRecord = Record<string, () => postcss.AcceptedPlugin>;

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
	transformInput?: (contents: string | Buffer, filePath: string) => string | Promise<string>;
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
	/**
	 * Factory functions for recreating stateful PostCSS plugins.
	 *
	 * When provided, Ecopages uses these factories to build a fresh plugin list
	 * for dependency-driven stylesheet rebuilds during development.
	 */
	pluginFactories?: PluginFactoryRecord;
}

/**
 * PostCssProcessorPlugin
 * A Processor for transforming CSS files.
 */
export class PostCssProcessorPlugin extends Processor<PostCssProcessorPluginConfig> {
	static DEFAULT_OPTIONS: Required<Pick<PostCssProcessorPluginConfig, 'filter'>> = {
		filter: /\.css$/,
	};

	private buildContributionsPrepared = false;
	private postcssPlugins: postcss.AcceptedPlugin[] = [];
	private pluginFactories?: PluginFactoryRecord;
	private readonly runtimeCssCache = new Map<string, string>();
	private readonly trackedCssFiles = new Set<string>();
	private watchQueue: Promise<void> = Promise.resolve();

	private getCssFilter(): RegExp {
		return this.options?.filter ?? PostCssProcessorPlugin.DEFAULT_OPTIONS.filter;
	}

	private resolveProcessedCssPath(filePath: string): string | null {
		if (!this.context) {
			return null;
		}

		const relativePath = path.relative(this.context.srcDir, filePath);
		if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
			return null;
		}

		return path.join(this.context.distDir, 'assets', relativePath);
	}

	private readProcessedCssFromDist(filePath: string): string | null {
		const outputPath = this.resolveProcessedCssPath(filePath);
		if (!outputPath || !fileSystem.exists(outputPath)) {
			return null;
		}

		return fileSystem.readFileAsBuffer(outputPath).toString('utf-8');
	}

	private async persistProcessedCss(filePath: string, css: string): Promise<void> {
		const outputPath = this.resolveProcessedCssPath(filePath);
		if (!outputPath) {
			return;
		}

		fileSystem.ensureDir(path.dirname(outputPath));
		fileSystem.write(outputPath, css);
	}

	private async prewarmRuntimeCssCache(): Promise<void> {
		if (!this.context) {
			return;
		}

		const sourceFiles = await fileSystem.glob(['**/*.{css,scss,sass,less}'], {
			cwd: this.context.srcDir,
		});

		for (const relativePath of sourceFiles) {
			const filePath = path.join(this.context.srcDir, relativePath);
			if (!this.matchesFileFilter(filePath)) {
				continue;
			}

			this.trackedCssFiles.add(filePath);

			const rawContents = await fileSystem.readFile(filePath);
			let transformedInput = rawContents;

			if (this.options?.transformInput) {
				transformedInput = await this.options.transformInput(rawContents, filePath);
			}

			const processed = await this.process(transformedInput, filePath);
			this.runtimeCssCache.set(filePath, processed);
			await this.persistProcessedCss(filePath, processed);
		}
	}

	private transformCssSync(input: CssTransformInput): string {
		const cached = this.runtimeCssCache.get(input.filePath);
		if (cached) {
			return cached;
		}

		const persisted = this.readProcessedCssFromDist(input.filePath);
		if (persisted) {
			this.runtimeCssCache.set(input.filePath, persisted);
			return persisted;
		}

		const { contents } = input;
		return typeof contents === 'string' ? contents : contents.toString('utf-8');
	}

	private async transformCssAsync(input: CssTransformInput): Promise<string> {
		const { contents, filePath } = input;
		let transformed: string = typeof contents === 'string' ? contents : contents.toString('utf-8');

		if (this.options?.transformInput) {
			const result = this.options.transformInput(contents, filePath);
			transformed =
				typeof (result as unknown as Record<string, unknown>).then === 'function'
					? await (result as Promise<string>)
					: (result as string);
		}

		const processed = await this.process(transformed, filePath);
		this.runtimeCssCache.set(filePath, processed);
		await this.persistProcessedCss(filePath, processed);
		return processed;
	}

	override matchesFileFilter(filepath: string): boolean {
		const filter = this.options?.filter ?? PostCssProcessorPlugin.DEFAULT_OPTIONS.filter;
		return filter.test(filepath);
	}

	private materializePluginFactories(pluginFactories: PluginFactoryRecord): postcss.AcceptedPlugin[] {
		return Object.values(pluginFactories).map((factory) => factory());
	}

	private refreshConfiguredPlugins(): void {
		if (!this.pluginFactories) {
			return;
		}

		this.postcssPlugins = this.materializePluginFactories(this.pluginFactories);
	}

	private enqueueWatchTask(task: () => Promise<void>): Promise<void> {
		const queuedTask = this.watchQueue.then(task, task);
		this.watchQueue = queuedTask.catch(() => undefined);
		return queuedTask;
	}

	private getTrackedCssFiles(): string[] {
		return Array.from(this.trackedCssFiles).filter(
			(filePath) => this.matchesFileFilter(filePath) && fileSystem.exists(filePath),
		);
	}

	private async handleDependencyChange(bridge: IClientBridge): Promise<void> {
		if (!this.context) {
			return;
		}

		const cssFiles = this.getTrackedCssFiles();
		if (cssFiles.length === 0) {
			return;
		}

		this.refreshConfiguredPlugins();

		for (const cssFilePath of cssFiles) {
			await this.handleCssChange(cssFilePath, bridge, false);
		}
	}

	constructor(
		config: Omit<ProcessorConfig<PostCssProcessorPluginConfig>, 'name' | 'description'> = {
			options: PostCssProcessorPlugin.DEFAULT_OPTIONS,
		},
	) {
		super({
			name: 'ecopages-postcss-processor',
			description: 'A Processor for transforming CSS files using PostCSS.',
			capabilities: [
				{
					kind: 'stylesheet',
					extensions: ['*.{css,scss,sass,less}'],
				},
			],
			watch: {
				paths: [],
				extensions: [
					'.css',
					'.scss',
					'.sass',
					'.less',
					'.tsx',
					'.ts',
					'.jsx',
					'.js',
					'.mdx',
					'.html',
					'.svelte',
					'.vue',
				],
				onChange: async ({ path, bridge }) => {
					await this.enqueueWatchTask(async () => {
						if (this.matchesFileFilter(path)) {
							await this.handleCssChange(path, bridge);
							return;
						}

						await this.handleDependencyChange(bridge);
					});
				},
				onCreate: async ({ path, bridge }) => {
					await this.enqueueWatchTask(async () => {
						if (this.matchesFileFilter(path)) {
							await this.handleCssChange(path, bridge);
							return;
						}

						await this.handleDependencyChange(bridge);
					});
				},
				onDelete: async ({ path, bridge }) => {
					await this.enqueueWatchTask(async () => {
						if (this.matchesFileFilter(path)) {
							this.runtimeCssCache.delete(path);
							this.trackedCssFiles.delete(path);
							return;
						}

						await this.handleDependencyChange(bridge);
					});
				},
			},
			...config,
		});
	}

	/**
	 * Handles CSS file changes during development.
	 * Processes the file and broadcasts a css-update event for hot reloading.
	 */
	private async handleCssChange(filePath: string, bridge: IClientBridge, refreshPlugins = true): Promise<void> {
		if (!this.context) return;
		if (!fileSystem.exists(filePath)) return;

		try {
			this.trackedCssFiles.add(filePath);

			if (refreshPlugins) {
				this.refreshConfiguredPlugins();
			}

			let content = await fileSystem.readFile(filePath);

			if (this.options?.transformInput) {
				content = await this.options.transformInput(content, filePath);
			}

			const processed = await this.process(content, filePath);

			const cached = this.runtimeCssCache.get(filePath);
			if (cached === processed) {
				return;
			}

			this.runtimeCssCache.set(filePath, processed);
			await this.persistProcessedCss(filePath, processed);

			bridge.cssUpdate(filePath);

			logger.debug(`Processed CSS: ${filePath}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`Failed to process CSS: ${filePath}`, errorMessage);
			bridge.error(errorMessage);
		}
	}

	get buildPlugins(): EcoBuildPlugin[] {
		return [
			createCssLoaderPlugin({
				name: 'postcss-processor-build-loader',
				filter: this.getCssFilter(),
				transform: this.transformCssAsync.bind(this),
			}),
		];
	}

	get plugins(): EcoBuildPlugin[] {
		return [
			createCssLoaderPlugin({
				name: 'postcss-processor-runtime-loader',
				filter: this.getCssFilter(),
				transform: this.transformCssSync.bind(this),
			}),
		];
	}

	/**
	 * Resolves the configured PostCSS plugin list before config build seals the
	 * app manifest.
	 *
	 * @remarks
	 * Runtime setup reuses this prepared list and only performs cache prewarming.
	 */
	override async prepareBuildContributions(): Promise<void> {
		if (this.buildContributionsPrepared) {
			return;
		}

		await this.collectPostcssPlugins();
		this.buildContributionsPrepared = true;
	}

	/**
	 * Performs runtime-only PostCSS setup after build contributions are ready.
	 */
	async setup(): Promise<void> {
		await this.prepareBuildContributions();
		await this.prewarmRuntimeCssCache();
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
		let loadedPluginFactories: PluginFactoryRecord | undefined;

		for (const ext of configExtensions) {
			const configPath = path.join(this.context.rootDir, `postcss.config.${ext}`);
			if (fileSystem.exists(configPath)) {
				foundConfigPath = configPath;
				break;
			}
		}

		if (foundConfigPath) {
			try {
				logger.debug(`Loading PostCSS config from: ${foundConfigPath}`);

				const postcssConfigModule = await import(foundConfigPath);
				const postcssConfig = postcssConfigModule.default || postcssConfigModule;
				if (
					postcssConfig &&
					typeof postcssConfig.pluginFactories === 'object' &&
					postcssConfig.pluginFactories !== null
				) {
					loadedPluginFactories = postcssConfig.pluginFactories as PluginFactoryRecord;
				}

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

		if (loadedPluginFactories) {
			this.pluginFactories = loadedPluginFactories;
			this.postcssPlugins = this.materializePluginFactories(loadedPluginFactories);
		} else if (loadedPlugins) {
			this.pluginFactories = undefined;
			this.postcssPlugins = loadedPlugins;
		} else if (this.options?.pluginFactories || this.options?.plugins) {
			this.pluginFactories = this.options?.pluginFactories;

			if (this.options?.plugins) {
				logger.debug('Using PostCSS plugins provided in processor options.');
				this.postcssPlugins = Object.values(this.options.plugins);
			} else if (this.options?.pluginFactories) {
				logger.debug('Using PostCSS plugin factories provided in processor options.');
				this.postcssPlugins = this.materializePluginFactories(this.options.pluginFactories);
			}
		} else {
			logger.warn(
				'No PostCSS plugins configured. Use a preset like tailwindV3Preset() or tailwindV4Preset(), ' +
					'provide plugins via options, or create a postcss.config file.',
			);
			this.pluginFactories = undefined;
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
		const input =
			this.options?.transformInput && filePath
				? await this.options.transformInput(fileAsString, filePath)
				: fileAsString;

		return await PostCssProcessor.processStringOrBuffer(input, {
			filePath,
			plugins: this.postcssPlugins,
			transformOutput: this.options?.transformOutput,
		});
	}

	processSync(fileAsString: string, filePath?: string): string {
		const input =
			this.options?.transformInput && filePath
				? this.options.transformInput(fileAsString, filePath)
				: fileAsString;

		if (input instanceof Promise) {
			throw new Error('transformInput must be synchronous when used with processSync');
		}

		return PostCssProcessor.processStringOrBufferSync(input, {
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
