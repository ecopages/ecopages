/**
 * PostCssProcessorPlugin
 * @module @ecopages/postcss-processor
 */

import {
	isEcopagesEnvEnabled,
	Processor,
	type ProcessorConfig,
	type StylesheetInvalidation,
	type StylesheetTransformResult,
} from '@ecopages/core/processor';
import { Logger } from '@ecopages/logger';
import type postcss from 'postcss';
import {
	findPostcssConfigPath,
	loadPostcssConfigFromFile,
	type LoadedPostcssConfig,
} from './postcss-config-loading.ts';
import { transformWithPostcss } from './postcss-processor.ts';

/** Files whose class names Tailwind and similar plugins scan, so a change to one can change a stylesheet. */
const CONTENT_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mdx', '.html', '.svelte', '.vue'];

const logger = new Logger('[@ecopages/postcss-processor]', {
	debug: isEcopagesEnvEnabled('ECOPAGES_LOGGER_DEBUG'),
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
	 * The stylesheets to rebuild when a template or script changes; every entry stylesheet when unset.
	 *
	 * Use this when only known stylesheets read those files, such as a Tailwind reference file.
	 */
	dependencyEntryPaths?: string[];
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

	private postcssPluginsLoading?: Promise<void>;
	private postcssPlugins: postcss.AcceptedPlugin[] = [];
	private pluginFactories?: PluginFactoryRecord;

	private materializePluginFactories(pluginFactories: PluginFactoryRecord): postcss.AcceptedPlugin[] {
		return Object.values(pluginFactories).map((factory) => factory());
	}

	private refreshConfiguredPlugins(): void {
		if (!this.pluginFactories) {
			return;
		}

		this.postcssPlugins = this.materializePluginFactories(this.pluginFactories);
	}

	constructor(
		config: Omit<ProcessorConfig<PostCssProcessorPluginConfig>, 'name'> = {
			options: PostCssProcessorPlugin.DEFAULT_OPTIONS,
		},
	) {
		const filter = config.options?.filter ?? PostCssProcessorPlugin.DEFAULT_OPTIONS.filter;
		super({
			name: 'ecopages-postcss-processor',
			...config,
			capabilities: [
				...(config.capabilities ?? []).filter((capability) => capability.kind !== 'stylesheet'),
				{
					kind: 'stylesheet',
					extensions: ['*.css'],
					filter,
				},
			],
		});
	}

	/**
	 * Recreates the plugins from their factories and names the stylesheets to rebuild when a scanned file changes.
	 *
	 * @remarks
	 * Tailwind keeps the class names it found in long-lived plugin instances, so fresh ones are needed to find new
	 * ones. A change to no template or script invalidates nothing.
	 */
	override invalidateStylesheets(files: readonly string[]): StylesheetInvalidation {
		if (!files.some((file) => CONTENT_EXTENSIONS.some((extension) => file.endsWith(extension)))) {
			return [];
		}

		this.refreshConfiguredPlugins();
		return this.options?.dependencyEntryPaths ?? 'all';
	}

	/**
	 * @remarks
	 * Core's development stylesheet service prewarms and rebuilds the app's stylesheets; the plugin list loads on the
	 * first transform.
	 */
	async setup(): Promise<void> {}

	/**
	 * Get the PostCSS plugins from the options or a config file.
	 * Searches for postcss.config.{js,cjs,mjs,ts} in the root directory.
	 */
	private resolvePostcssPluginsFromSources(loaded: LoadedPostcssConfig): void {
		if (loaded.pluginFactories) {
			this.pluginFactories = loaded.pluginFactories;
			this.postcssPlugins = this.materializePluginFactories(loaded.pluginFactories);
			return;
		}

		if (loaded.plugins) {
			this.pluginFactories = undefined;
			this.postcssPlugins = loaded.plugins;
			return;
		}

		if (this.options?.pluginFactories || this.options?.plugins) {
			this.pluginFactories = this.options?.pluginFactories;

			if (this.options?.plugins) {
				logger.debug('Using PostCSS plugins provided in processor options.');
				this.postcssPlugins = Object.values(this.options.plugins);
				return;
			}

			if (this.options?.pluginFactories) {
				logger.debug('Using PostCSS plugin factories provided in processor options.');
				this.postcssPlugins = this.materializePluginFactories(this.options.pluginFactories);
				return;
			}
		}

		this.pluginFactories = undefined;
		this.postcssPlugins = [];
	}

	/**
	 * Loads the PostCSS plugin list once, on the first stylesheet that needs it.
	 *
	 * @remarks
	 * Config finalization does not load the plugins, so a build that starts before `setup()` and a `setup()` of an
	 * app without stylesheets both work. A failed load is dropped so the next stylesheet retries.
	 */
	private ensurePostcssPlugins(): Promise<void> {
		this.postcssPluginsLoading ??= this.collectPostcssPlugins().catch((error) => {
			this.postcssPluginsLoading = undefined;
			throw error;
		});
		return this.postcssPluginsLoading;
	}

	private async collectPostcssPlugins(): Promise<void> {
		if (!this.context) {
			throw new Error('Context must be set');
		}

		const foundConfigPath = findPostcssConfigPath(this.context.rootDir);
		const loaded = foundConfigPath
			? await loadPostcssConfigFromFile(foundConfigPath)
			: (logger.debug('No PostCSS config file found in root directory.'), {});

		this.resolvePostcssPluginsFromSources(loaded);

		if (!this.postcssPlugins || this.postcssPlugins.length === 0) {
			logger.warn(
				'No PostCSS plugins configured. Use a preset like tailwindV3Preset() or tailwindV4Preset(), ' +
					'provide plugins via options, or create a postcss.config file.',
			);
			this.postcssPlugins = [];
		}
	}

	/**
	 * Runs the configured PostCSS plugins over one stylesheet.
	 *
	 * @param fileAsString CSS content as string
	 * @param filePath File path for resolving relative imports
	 * @returns The processed CSS and the files PostCSS reported reading
	 */
	override async transformStylesheet(fileAsString: string, filePath: string): Promise<StylesheetTransformResult> {
		await this.ensurePostcssPlugins();

		const input = this.options?.transformInput
			? await this.options.transformInput(fileAsString, filePath)
			: fileAsString;

		return transformWithPostcss(input, {
			filePath,
			plugins: this.postcssPlugins,
			transformOutput: this.options?.transformOutput,
		});
	}
}

export const postcssProcessorPlugin = (config?: PostCssProcessorPluginConfig): PostCssProcessorPlugin => {
	return new PostCssProcessorPlugin({
		options: config,
	});
};
