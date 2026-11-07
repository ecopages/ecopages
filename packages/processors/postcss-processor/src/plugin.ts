/**
 * PostCssProcessorPlugin
 * @module @ecopages/postcss-processor
 */

import { path } from '@ecopages/file-system/path';
import { isEcopagesEnvEnabled, isProductionRuntime, writeSourceRelativeStylesheet } from '@ecopages/core/processor';
import type { IClientBridge } from '@ecopages/core/integration';
import { fileSystem } from '@ecopages/file-system';
import {
	Processor,
	type ProcessorConfig,
	type ProcessorWatchChanges,
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
	 * CSS entry files to rebuild when a non-CSS dependency changes.
	 *
	 * Use this when the processor watches template or script files that affect a
	 * known stylesheet entry, such as a Tailwind reference file.
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
	private readonly runtimeCssCache = new Map<string, string>();

	/**
	 * Stylesheets whose last development pass failed.
	 *
	 * @remarks
	 * A failure keeps the last good output in {@link runtimeCssCache}, so the first success after it can produce
	 * the same bytes. That save must still broadcast, since the browser clears the error overlay only on a
	 * non-error message.
	 */
	private readonly failedCssFiles = new Set<string>();
	private readonly trackedCssFiles = new Set<string>();
	private watchQueue: Promise<void> = Promise.resolve();

	/**
	 * Maps an imported CSS file path → set of tracked CSS entry files that import it.
	 * Used to resolve which parent entry files need re-processing when a dependency changes.
	 */
	private readonly cssDependencyMap = new Map<string, Set<string>>();

	/**
	 * @remarks
	 * Stylesheets in the public directory are excluded: the build copies them as written and serves them
	 * as they are, so a processed copy would be emitted but linked by no Page.
	 */
	private matchesCssFilter(filePath: string): boolean {
		return !this.isInsidePublicDir(filePath) && this.canProcessAsset('stylesheet', filePath);
	}

	private isInsidePublicDir(filePath: string): boolean {
		const publicDir = this.context?.config.absolutePaths.publicDir;
		if (!publicDir) {
			return false;
		}

		const relativePath = path.relative(publicDir, filePath);
		return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
	}

	private isCssInsideSrc(filePath: string): boolean {
		if (!this.context) {
			return false;
		}

		const relativePath = path.relative(this.context.srcDir, filePath);
		return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
	}

	/**
	 * Writes processed CSS at its source-relative path under `dist/client/assets` in development, where CSS HMR
	 * refreshes that href.
	 *
	 * @remarks
	 * Core's {@link writeSourceRelativeStylesheet} writes it, the same path core takes when a Page links the
	 * stylesheet, so the files its relative `url()` references name are emitted after an edit too. Production writes
	 * nothing: the stylesheet pipeline emits each stylesheet a Page links under its content hash, and a bundle that
	 * imports CSS carries it. A copy written here would be a file no Page references.
	 */
	private persistProcessedCss(filePath: string, css: string): void {
		if (!this.context || isProductionRuntime() || !this.isCssInsideSrc(filePath)) {
			return;
		}

		const { srcDir, distDir } = this.context;
		writeSourceRelativeStylesheet({ srcDir, distDir }, filePath, css);
	}

	/**
	 * @remarks
	 * A stylesheet that fails here is logged and skipped, so one broken file does not stop the dev server from
	 * starting. A build that imports it, through core's stylesheet module compiler, and the dev watcher process it
	 * again and report the failure.
	 */
	private async prewarmRuntimeCssCache(): Promise<void> {
		if (!this.context) {
			return;
		}

		const sourceFiles = await fileSystem.glob(['**/*.css'], {
			cwd: this.context.srcDir,
		});

		for (const relativePath of sourceFiles) {
			const filePath = path.join(this.context.srcDir, relativePath);
			if (!this.matchesCssFilter(filePath)) {
				continue;
			}

			this.trackedCssFiles.add(filePath);

			const rawContents = await fileSystem.readFile(filePath);

			try {
				const { css: processed } = await this.transformStylesheet(rawContents, filePath);
				this.runtimeCssCache.set(filePath, processed);
				this.persistProcessedCss(filePath, processed);
			} catch (error) {
				logger.error(`Failed to process CSS: ${filePath}`, error instanceof Error ? error.message : error);
			}
		}

		this.buildCssDependencyMap();
	}

	/**
	 * Regex to match CSS @import statements and extract the path.
	 * Handles: @import './foo.css'; @import "./foo.css"; @import url('./foo.css');
	 */
	private static readonly CSS_IMPORT_REGEX = /@import\s+(?:url\(\s*)?['"]([^'"]+\.css)['"](?:\s*\))?\s*;/gm;

	/**
	 * Builds the CSS dependency map by scanning tracked CSS files for @import directives.
	 * Maps each imported file to the set of tracked entry files that import it (directly or transitively).
	 */
	private buildCssDependencyMap(): void {
		this.cssDependencyMap.clear();

		for (const entryFile of this.trackedCssFiles) {
			if (!fileSystem.exists(entryFile)) continue;

			const rawContents = fileSystem.readFileAsBuffer(entryFile).toString('utf-8');
			const imports = this.extractCssImports(rawContents, entryFile);

			for (const importedFile of imports) {
				if (!this.cssDependencyMap.has(importedFile)) {
					this.cssDependencyMap.set(importedFile, new Set());
				}
				this.cssDependencyMap.get(importedFile)!.add(entryFile);
			}
		}
	}

	/**
	 * Extracts resolved absolute paths of CSS files imported via @import in the given CSS content.
	 * Recursively follows imports to capture transitive dependencies.
	 * It skips bare module imports like @import 'tailwindcss'.
	 * It recursively follows imports to capture transitive dependencies.
	 */
	private extractCssImports(cssContent: string, fromFile: string, visited = new Set<string>()): string[] {
		const dir = path.dirname(fromFile);
		const imports: string[] = [];

		let match: RegExpExecArray | null;
		const regex = new RegExp(PostCssProcessorPlugin.CSS_IMPORT_REGEX.source, 'gm');

		while ((match = regex.exec(cssContent)) !== null) {
			const importPath = match[1];

			if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
				continue;
			}

			const resolvedPath = path.resolve(dir, importPath);

			if (visited.has(resolvedPath)) continue;
			visited.add(resolvedPath);

			imports.push(resolvedPath);

			if (fileSystem.exists(resolvedPath)) {
				const nestedContent = fileSystem.readFileAsBuffer(resolvedPath).toString('utf-8');
				const nestedImports = this.extractCssImports(nestedContent, resolvedPath, visited);
				imports.push(...nestedImports);
			}
		}

		return imports;
	}

	/**
	 * Resolves a changed CSS file to its parent entry file(s) if it is an @import dependency.
	 * Returns an empty array if the file is not an import dependency (i.e., it's an entry file itself).
	 */
	private resolveEntryFiles(filePath: string): string[] {
		const entries = this.cssDependencyMap.get(filePath);
		if (!entries || entries.size === 0) {
			return [];
		}
		return Array.from(entries);
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
			(filePath) => this.matchesCssFilter(filePath) && fileSystem.exists(filePath),
		);
	}

	private getTrackedCssEntryFiles(): string[] {
		const importedCssFiles = new Set(this.cssDependencyMap.keys());

		return this.getTrackedCssFiles().filter((filePath) => !importedCssFiles.has(filePath));
	}

	private getDependencyEntryFiles(): string[] {
		const configuredEntryPaths = this.options?.dependencyEntryPaths;
		if (!configuredEntryPaths || configuredEntryPaths.length === 0) {
			return this.getTrackedCssEntryFiles();
		}

		return configuredEntryPaths.filter(
			(filePath) => this.matchesCssFilter(filePath) && fileSystem.exists(filePath),
		);
	}

	private async rebuildCssEntryFiles(filePaths: Iterable<string>, bridge: IClientBridge): Promise<void> {
		if (!this.context) {
			return;
		}

		const cssFiles = [...new Set(filePaths)].filter((filePath) => this.matchesCssFilter(filePath));
		if (cssFiles.length === 0) {
			return;
		}

		this.refreshConfiguredPlugins();

		for (const cssFilePath of cssFiles) {
			await this.processAndBroadcast(cssFilePath, bridge, false);
		}
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
			watch: config.watch ?? {
				paths: [],
				extensions: ['.css', '.tsx', '.ts', '.jsx', '.js', '.mdx', '.html', '.svelte', '.vue'],
				onChanges: async (changes) => this.handleWatchChanges(changes),
			},
		});
	}

	private async handleWatchChanges({ created, changed, deleted, bridge }: ProcessorWatchChanges): Promise<void> {
		await this.enqueueWatchTask(async () => {
			const createdCss = created.filter((filePath) => this.matchesCssFilter(filePath));
			const changedCss = changed.filter((filePath) => this.matchesCssFilter(filePath));
			const deletedCss = deleted.filter((filePath) => this.matchesCssFilter(filePath));

			for (const filePath of createdCss) {
				this.trackedCssFiles.add(filePath);
			}

			for (const filePath of deletedCss) {
				this.runtimeCssCache.delete(filePath);
				this.failedCssFiles.delete(filePath);
				this.trackedCssFiles.delete(filePath);
				this.cssDependencyMap.delete(filePath);
			}

			if (createdCss.length > 0 || changedCss.length > 0 || deletedCss.length > 0) {
				this.buildCssDependencyMap();
			}

			const dependencyChanged = [...created, ...changed, ...deleted].some(
				(filePath) => !this.matchesCssFilter(filePath),
			);
			const affectedCssEntryFiles = new Set<string>();
			for (const filePath of [...createdCss, ...changedCss]) {
				const parentEntryFiles = this.resolveEntryFiles(filePath);
				if (parentEntryFiles.length > 0) {
					for (const entryFile of parentEntryFiles) {
						affectedCssEntryFiles.add(entryFile);
						this.runtimeCssCache.delete(entryFile);
					}
				} else if (fileSystem.exists(filePath)) {
					affectedCssEntryFiles.add(filePath);
				}
			}

			const cssEntryFiles = new Set(affectedCssEntryFiles);
			if (dependencyChanged || deletedCss.length > 0) {
				for (const filePath of this.getDependencyEntryFiles()) {
					cssEntryFiles.add(filePath);
					if (deletedCss.length > 0) {
						this.runtimeCssCache.delete(filePath);
					}
				}
			}

			await this.rebuildCssEntryFiles(cssEntryFiles, bridge);
		});
	}

	/**
	 * Processes a CSS file and broadcasts a css-update event.
	 * Skips broadcast if the processed output hasn't changed.
	 */
	private async processAndBroadcast(filePath: string, bridge: IClientBridge, refreshPlugins = true): Promise<void> {
		if (!this.context) return;
		if (!fileSystem.exists(filePath)) return;

		try {
			this.trackedCssFiles.add(filePath);

			if (refreshPlugins) {
				this.refreshConfiguredPlugins();
			}

			const content = await fileSystem.readFile(filePath);

			const { css: processed } = await this.transformStylesheet(content, filePath);

			const recovered = this.failedCssFiles.delete(filePath);
			const cached = this.runtimeCssCache.get(filePath);
			if (cached === processed && !recovered) {
				return;
			}

			this.persistProcessedCss(filePath, processed);
			this.runtimeCssCache.set(filePath, processed);

			bridge.cssUpdate(filePath);

			logger.debug(`Processed CSS: ${filePath}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.failedCssFiles.add(filePath);
			logger.error(`Failed to process CSS: ${filePath}`, errorMessage);
			bridge.error(errorMessage);
		}
	}

	/**
	 * Prewarms the runtime CSS cache, which loads the configured PostCSS plugins on the first stylesheet.
	 */
	async setup(): Promise<void> {
		await this.prewarmRuntimeCssCache();
	}

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

		logger.warn(
			'No PostCSS plugins configured. Use a preset like tailwindV3Preset() or tailwindV4Preset(), ' +
				'provide plugins via options, or create a postcss.config file.',
		);
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
			logger.warn('No PostCSS plugins configured or loaded. CSS processing might be minimal.');
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
