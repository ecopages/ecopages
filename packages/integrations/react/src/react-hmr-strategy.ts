/**
 * React HMR Strategy
 *
 * Handles hot module replacement for React components.
 * Triggers module invalidation on changes to ensure fresh component re-renders.
 *
 * @module
 */

import path from 'node:path';

import { HmrStrategy, HmrStrategyType, type HmrAction } from '@ecopages/core/hmr/hmr-strategy';
import { RESOLVED_ASSETS_DIR } from '@ecopages/core/constants';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import { createBrowserRuntimePlugin } from '@ecopages/core/build/browser-runtime-plugin';
import type { BrowserRuntimeManifest } from '@ecopages/core/build/browser-runtime-manifest';
import { FileNotFoundError, fileSystem } from '@ecopages/file-system';
import { Logger } from '@ecopages/logger';
import type { DefaultHmrContext } from '@ecopages/core';
import type { CompileOptions } from '@mdx-js/mdx';
import { injectHmrHandler } from './utils/hmr-scripts.ts';
import { createClientGraphBoundaryPlugin } from './utils/client-graph-boundary-plugin.ts';
import { ClientGraphBoundaryCache } from './utils/client-graph-boundary-cache.ts';
import { collectPageDeclaredModules, collectPageDeclaredModulesFromModule } from './utils/declared-modules.ts';
import { someInConfigTree } from './utils/component-config-traversal.ts';
import { createReactMdxLoaderPlugin } from './utils/react-mdx-loader-plugin.ts';
import { getReactClientGraphAllowSpecifiers } from './utils/react-runtime-alias-map.ts';
import type { ReactHmrPageMetadataCache } from './services/react-hmr-page-metadata-cache.ts';
import { PagesIndex } from './services/pages-index.ts';
import type { EcoComponentConfig } from '@ecopages/core';

const appLogger = new Logger('[ReactHmrStrategy]');

export interface ReactHmrStrategyOptions {
	context: DefaultHmrContext;
	pageMetadataCache: ReactHmrPageMetadataCache;
	runtimeManifest: BrowserRuntimeManifest;
	mdxCompilerOptions?: CompileOptions;
	ownedTemplateExtensions?: string[];
	allTemplateExtensions?: string[];
	explicitGraphEnabled?: boolean;
	/**
	 * Per-app cache for client-graph-boundary transform results. Owned by
	 * the React plugin for the app's lifetime. When omitted, the strategy
	 * uses a fresh in-memory cache that does not persist across HMR
	 * rebuilds.
	 */
	clientGraphBoundaryCache?: ClientGraphBoundaryCache;
}

type ImportedReactPageModule = {
	default?: { config?: EcoComponentConfig };
	config?: EcoComponentConfig;
};

/**
 * Shared HMR build target for one React-owned browser entrypoint.
 *
 * @remarks
 * Grouped HMR rebuilds operate on these normalized pairs so the strategy can
 * expand one requested page or layout change into the full set of page entries
 * that should share a browser graph, while still knowing which emitted URLs are
 * relevant to the current update broadcast.
 */
type ReactHmrBuildTarget = {
	entrypointPath: string;
	outputUrl: string;
};

/**
 * Strategy for handling React component HMR updates.
 *
 * This strategy provides React-specific HMR handling by rebuilding entrypoints
 * and injecting HMR acceptance handlers that trigger module invalidation.
 *
 * The processing steps are:
 * 1. Check if any React entrypoints are registered
 * 2. Rebuild all React entrypoints (the changed file could be a dependency)
 * 3. Rebuild browser output through the shared browser bundle service while
 *    preserving React-specific runtime aliases and graph policy
 * 4. Read page config metadata through the shared server-module loading path
 * 5. Inject HMR acceptance handler
 * 6. Broadcast update events for each rebuilt entrypoint
 *
 * @remarks
 * This strategy has higher priority than generic JsHmrStrategy, allowing it
 * to handle React files specially while falling back to generic handling for
 * non-React files.
 *
 * Future enhancement: Track dependencies using Bun's transpiler API to only
 * rebuild affected entrypoints instead of all of them.
 *
 * @see https://bun.sh/docs/runtime/transpiler
 *
 * @example
 * ```typescript
 * const context = {
 *   getWatchedFiles: () => watchedFilesMap,
 *   getDistDir: () => '/path/to/dist/_hmr',
 *   getPlugins: () => [],
 *   getSrcDir: () => '/path/to/src',
 *   getLayoutsDir: () => '/path/to/src/layouts'
 * };
 * const strategy = new ReactHmrStrategy({
 *   context,
 *   pageMetadataCache,
 *   runtimeManifest
 * });
 * ```
 */
export class ReactHmrStrategy extends HmrStrategy {
	readonly type = HmrStrategyType.INTEGRATION;
	private mdxCompilerOptions?: CompileOptions;
	private readonly ownedTemplateExtensions: Set<string>;
	private readonly allTemplateExtensions: string[];
	private async importNodePageModule(entrypointPath: string): Promise<ImportedReactPageModule> {
		return await this.context.importServerModule(entrypointPath);
	}

	/**
	 * Creates a new React HMR strategy instance.
	 *
	 * @param options - React HMR runtime services and behavior flags.
	 */
	private context: DefaultHmrContext;
	private pageMetadataCache: ReactHmrPageMetadataCache;
	private explicitGraphEnabled: boolean;
	private readonly runtimeManifest: BrowserRuntimeManifest;
	private readonly clientGraphBoundaryCache: ClientGraphBoundaryCache;
	private readonly pagesIndex: PagesIndex;

	constructor(options: ReactHmrStrategyOptions) {
		super();
		this.context = options.context;
		this.pageMetadataCache = options.pageMetadataCache;
		this.runtimeManifest = options.runtimeManifest;
		this.explicitGraphEnabled = options.explicitGraphEnabled ?? false;
		this.clientGraphBoundaryCache = options.clientGraphBoundaryCache ?? new ClientGraphBoundaryCache();
		this.pagesIndex = new PagesIndex({
			pagesDir: this.context.getPagesDir(),
			extensions: options.allTemplateExtensions,
			isPageEntrypoint: (file) => this.isPageEntrypoint(file),
		});
		this.mdxCompilerOptions = options.mdxCompilerOptions;
		this.ownedTemplateExtensions = new Set(options.ownedTemplateExtensions ?? ['.tsx']);
		this.allTemplateExtensions = [...(options.allTemplateExtensions ?? ['.tsx'])].sort(
			(a, b) => b.length - a.length,
		);
	}

	/**
	 * Returns build plugins for React HMR bundling.
	 *
	 * Includes the client graph boundary plugin to prevent undeclared imports
	 * (including `node:*`) from breaking the browser bundle.
	 *
	 * @remarks
	 * HMR builds receive the React runtime manifest and rewrite manifest-owned
	 * runtime imports to concrete asset URLs before module resolution.
	 */
	private getBuildPlugins(declaredModules?: readonly string[]): EcoBuildPlugin[] {
		const allowSpecifiers = getReactClientGraphAllowSpecifiers(
			this.runtimeManifest.assets.map((asset) => asset.specifier),
		);
		const runtimeRewritePlugin = createBrowserRuntimePlugin({
			name: 'react-hmr-runtime-import-rewrite',
			manifest: this.runtimeManifest,
		});

		return [
			createClientGraphBoundaryPlugin({
				absWorkingDir: path.dirname(this.context.getSrcDir()),
				alwaysAllowSpecifiers: allowSpecifiers,
				declaredModules,
				cache: this.clientGraphBoundaryCache,
			}),
			...(runtimeRewritePlugin ? [runtimeRewritePlugin] : []),
			...this.context.getPlugins(),
		];
	}

	private isReactEntrypoint(filePath: string): boolean {
		if (filePath.endsWith('.mdx')) {
			return this.mdxCompilerOptions !== undefined;
		}

		if (!filePath.endsWith('.tsx')) {
			return false;
		}

		const templateExtension = this.resolveTemplateExtension(filePath);
		if (templateExtension && templateExtension !== '.tsx') {
			return this.ownedTemplateExtensions.has(templateExtension);
		}

		if (!this.isRouteTemplate(filePath)) {
			return true;
		}

		if (!templateExtension) {
			return false;
		}

		return this.ownedTemplateExtensions.has(templateExtension);
	}

	/**
	 * Returns true when a route file uses a compound extension like `page.foo.tsx`.
	 *
	 * @remarks
	 * React integration owns plain `.tsx` route templates. Compound extensions in
	 * pages/layouts are integration-specific route templates and should not be
	 * claimed by React HMR strategy.
	 */
	private isRouteTemplate(filePath: string): boolean {
		return filePath.startsWith(this.context.getPagesDir()) || filePath.startsWith(this.context.getLayoutsDir());
	}

	private resolveTemplateExtension(filePath: string): string | undefined {
		return this.allTemplateExtensions.find((extension) => filePath.endsWith(extension));
	}

	private ownsWatchedEntrypoint(filePath: string): boolean {
		return this.pageMetadataCache.ownsEntrypoint(filePath);
	}

	private configContainsFile(config: EcoComponentConfig | undefined, filePath: string): boolean {
		const resolvedFilePath = path.resolve(filePath);

		return someInConfigTree(config, (node) => {
			if (!node.__eco?.file) {
				return false;
			}

			return path.resolve(node.__eco.file) === resolvedFilePath;
		});
	}

	private pageModuleRequiresLayoutRefresh(pageModule: ImportedReactPageModule, filePath: string): boolean {
		return [pageModule.default?.config, pageModule.config].some((config) => {
			return this.configContainsFile(config?.layout?.config, filePath);
		});
	}

	private async hasLayoutOwnedDependencyTarget(
		changedFilePath: string,
		requestedTargets: ReactHmrBuildTarget[],
	): Promise<boolean> {
		for (const target of requestedTargets) {
			if (!this.isPageEntrypoint(target.entrypointPath)) {
				continue;
			}

			const pageModule = await this.importNodePageModule(target.entrypointPath);
			if (this.pageModuleRequiresLayoutRefresh(pageModule, changedFilePath)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Determines if the file is a React/MDX entrypoint that's registered for HMR.
	 *
	 * Uses a three-way decision strategy for selective invalidation:
	 * 1. If the file is a watched entrypoint, check if React owns it
	 * 2. If the file is a dependency of watched entrypoints (via dependency graph),
	 *    check if any affected entrypoints are React-owned. Returns false if hits
	 *    exist but none are owned (prevents unnecessary rebuilds).
	 * 3. Otherwise, check if the file itself is a React entrypoint template
	 *
	 * @param filePath - Absolute path to the changed file
	 * @returns True if this file should trigger React HMR rebuilds
	 */
	matches(filePath: string): boolean {
		const watchedFiles = this.context.getWatchedFiles();
		appLogger.debug(`Checking ${filePath}. Watched: ${watchedFiles.size}`);
		if (watchedFiles.size === 0) {
			return false;
		}

		if (watchedFiles.has(filePath)) {
			return this.ownsWatchedEntrypoint(filePath);
		}

		const dependencyHits = this.context.getEntrypointDependencyGraph().getDependencyEntrypoints(filePath);
		if (dependencyHits.size > 0) {
			for (const entrypoint of dependencyHits) {
				if (this.ownsWatchedEntrypoint(entrypoint)) {
					return true;
				}
			}
			return false;
		}

		return this.isReactEntrypoint(filePath);
	}

	/**
	 * Checks if a file is a layout file.
	 *
	 * Layout files require special HMR handling because they wrap multiple pages and affect
	 * the entire page structure. When a layout changes, we trigger a 'layout-update' event
	 * instead of a regular 'update' event, which instructs the browser to perform a full
	 * page reload (or clear cache and re-render) rather than attempting module-level HMR.
	 *
	 * @param filePath - Absolute path to the file
	 * @returns True if the file is in the layouts directory
	 */
	private isLayoutFile(filePath: string): boolean {
		return filePath.startsWith(this.context.getLayoutsDir());
	}

	private isPageEntrypoint(filePath: string): boolean {
		return filePath.startsWith(this.context.getPagesDir()) && this.isReactEntrypoint(filePath);
	}

	private getEntrypointOutput(entrypointPath: string): { outputPath: string; outputUrl: string } {
		const srcDir = this.context.getSrcDir();
		const relativePath = path.relative(srcDir, entrypointPath);
		const relativePathJs = relativePath.replace(/\.(tsx?|jsx?|mdx)$/, '.js');
		const encodedPathJs = this.encodeDynamicSegments(relativePathJs);
		const outputPath = path.join(this.context.getDistDir(), encodedPathJs);
		const outputUrl = `/${path.join(RESOLVED_ASSETS_DIR, '_hmr', encodedPathJs).split(path.sep).join('/')}`;

		return { outputPath, outputUrl };
	}

	private getGroupedTempOutputPattern(entrypointPath: string): { outputDir: string; outputBaseName: string } {
		const srcDir = this.context.getSrcDir();
		const relativePath = path.relative(srcDir, entrypointPath);
		const relativePathJs = relativePath.replace(/\.(tsx?|jsx?|mdx)$/, '.js');

		return {
			outputDir: path.join(this.context.getDistDir(), path.dirname(relativePathJs)),
			outputBaseName: path.basename(relativePathJs, '.js'),
		};
	}

	private async collectReactPageBuildTargets(): Promise<ReactHmrBuildTarget[]> {
		await this.pagesIndex.refresh();
		const indexed = this.pagesIndex.list();
		const targets = new Map<string, ReactHmrBuildTarget>();

		for (const entrypointPath of indexed) {
			this.pageMetadataCache.markOwnedEntrypoint(entrypointPath);
			targets.set(entrypointPath, {
				entrypointPath,
				outputUrl: this.getEntrypointOutput(entrypointPath).outputUrl,
			});
		}

		return Array.from(targets.values()).sort((left, right) =>
			left.entrypointPath.localeCompare(right.entrypointPath),
		);
	}

	/**
	 * Expands one HMR request into the full React page build cohort when needed.
	 *
	 * @remarks
	 * Page and layout changes need one shared rebuild pass so sibling routes keep
	 * a consistent client module graph. Non-page changes that do not touch a page
	 * cohort can stay scoped to the originally requested targets.
	 */
	private async resolveBuildTargets(
		requestedTargets: ReactHmrBuildTarget[],
		changedFilePath: string,
	): Promise<ReactHmrBuildTarget[]> {
		const requestedPageTargets = requestedTargets.filter((target) => this.isPageEntrypoint(target.entrypointPath));
		const shouldGroupPageBuilds = this.isLayoutFile(changedFilePath) || requestedPageTargets.length > 0;

		if (!shouldGroupPageBuilds) {
			return [];
		}

		const groupedTargets = new Map(requestedPageTargets.map((target) => [target.entrypointPath, target]));
		for (const target of await this.collectReactPageBuildTargets()) {
			groupedTargets.set(target.entrypointPath, target);
		}

		return Array.from(groupedTargets.values()).sort((left, right) =>
			left.entrypointPath.localeCompare(right.entrypointPath),
		);
	}

	private partitionBuildTargets(
		requestedTargets: ReactHmrBuildTarget[],
		groupedPageTargets: ReactHmrBuildTarget[],
	): {
		pageTargets: ReactHmrBuildTarget[];
		nonPageTargets: ReactHmrBuildTarget[];
	} {
		if (groupedPageTargets.length === 0) {
			return {
				pageTargets: [],
				nonPageTargets: requestedTargets,
			};
		}

		const groupedPageEntrypoints = new Set(groupedPageTargets.map((target) => target.entrypointPath));

		return {
			pageTargets: groupedPageTargets,
			nonPageTargets: requestedTargets.filter(
				(target) =>
					!groupedPageEntrypoints.has(target.entrypointPath) && !this.isPageEntrypoint(target.entrypointPath),
			),
		};
	}

	/**
	 * Processes a React file change by rebuilding affected React entrypoints.
	 *
	 * Uses a three-way decision strategy for selective invalidation:
	 * 1. Changed file is a watched entrypoint: rebuild only that entrypoint
	 * 2. Dependency graph has hits: rebuild only affected React-owned entrypoints.
	 *    If hits exist but none map to React-owned entrypoints, return 'none' to
	 *    prevent unnecessary rebuilds.
	 * 3. Dependency graph miss: fall back to rebuilding all watched entrypoints
	 *
	 * For layout files, broadcasts a 'layout-update' event to trigger full page reload.
	 * For regular components/pages, broadcasts 'update' events for module-level HMR.
	 *
	 * @param _filePath - Absolute path to the changed file
	 * @returns Action to broadcast update events (layout-update for layouts, update for components)
	 */
	async process(_filePath: string): Promise<HmrAction> {
		appLogger.debug(`Processing ${_filePath}`);
		const watchedFiles = this.context.getWatchedFiles();

		if (watchedFiles.size === 0) {
			appLogger.debug(`No watched files`);
			return { type: 'none' };
		}

		const isLayout = this.isLayoutFile(_filePath);
		const isChangedPageEntrypoint = this.isPageEntrypoint(_filePath);
		if (isLayout) {
			appLogger.debug(`Detected layout file change: ${_filePath}`);
		}

		const changedEntrypointOutput = watchedFiles.get(_filePath);
		if (changedEntrypointOutput && !this.ownsWatchedEntrypoint(_filePath)) {
			appLogger.debug(`Skipping non-React watched entrypoint: ${_filePath}`);
			return { type: 'none' };
		}

		const dependencyHits = this.context.getEntrypointDependencyGraph().getDependencyEntrypoints(_filePath);
		const hasDependencyHits = dependencyHits.size > 0;
		const affectedEntrypoints = new Map<string, string>();
		let hasOwnedLayoutDependencyHit = false;
		let layoutOwnedPageTargets: ReactHmrBuildTarget[] = [];
		let hasLayoutOwnedRequestedTarget = false;

		if (hasDependencyHits && !changedEntrypointOutput) {
			for (const entrypoint of dependencyHits) {
				const outputUrl = watchedFiles.get(entrypoint);
				if (outputUrl && this.ownsWatchedEntrypoint(entrypoint)) {
					affectedEntrypoints.set(entrypoint, outputUrl);
					continue;
				}

				if (this.isLayoutFile(entrypoint) && this.ownsWatchedEntrypoint(entrypoint)) {
					hasOwnedLayoutDependencyHit = true;
				}
			}

			if (affectedEntrypoints.size === 0 && !hasOwnedLayoutDependencyHit) {
				appLogger.debug(`Dependency hits found but none map to React-owned watched entrypoints`);
				return { type: 'none' };
			}
		}

		if (changedEntrypointOutput && !isLayout && !isChangedPageEntrypoint) {
			layoutOwnedPageTargets = await this.collectReactPageBuildTargets();
			hasLayoutOwnedRequestedTarget = await this.hasLayoutOwnedDependencyTarget(
				_filePath,
				layoutOwnedPageTargets,
			);
		}

		const requestedTargets = changedEntrypointOutput
			? hasLayoutOwnedRequestedTarget
				? [{ entrypointPath: _filePath, outputUrl: changedEntrypointOutput }, ...layoutOwnedPageTargets]
				: [{ entrypointPath: _filePath, outputUrl: changedEntrypointOutput }]
			: hasOwnedLayoutDependencyHit
				? await this.collectReactPageBuildTargets()
				: hasDependencyHits
					? Array.from(affectedEntrypoints, ([entrypointPath, outputUrl]) => ({ entrypointPath, outputUrl }))
					: Array.from(watchedFiles, ([entrypointPath, outputUrl]) => ({ entrypointPath, outputUrl }));

		const groupedPageTargets = await this.resolveBuildTargets(requestedTargets, _filePath);
		const { pageTargets, nonPageTargets } = this.partitionBuildTargets(requestedTargets, groupedPageTargets);
		if (!changedEntrypointOutput) {
			hasLayoutOwnedRequestedTarget = await this.hasLayoutOwnedDependencyTarget(_filePath, requestedTargets);
		}
		const requiresLayoutRefresh = isLayout || hasOwnedLayoutDependencyHit || hasLayoutOwnedRequestedTarget;

		const updates: string[] = [];
		const requestedOutputUrls = new Set(requestedTargets.map((target) => target.outputUrl));
		if (pageTargets.length > 1) {
			appLogger.debug(`Bundling ${pageTargets.length} React page entrypoints together`);
			const rebuiltOutputs = await this.bundleReactEntrypoints(pageTargets);
			for (const outputUrl of rebuiltOutputs) {
				if (requestedOutputUrls.has(outputUrl)) {
					updates.push(outputUrl);
				}
			}
		} else {
			for (const { entrypointPath, outputUrl } of pageTargets) {
				appLogger.debug(`Bundling ${entrypointPath}`);
				const success = await this.bundleReactEntrypoint(entrypointPath, outputUrl);
				if (success && requestedOutputUrls.has(outputUrl)) {
					updates.push(outputUrl);
				}
			}
		}

		for (const { entrypointPath, outputUrl } of nonPageTargets) {
			if (!this.isReactEntrypoint(entrypointPath)) {
				continue;
			}

			appLogger.debug(`Bundling ${entrypointPath}`);
			const success = await this.bundleReactEntrypoint(entrypointPath, outputUrl);
			if (success && requestedOutputUrls.has(outputUrl)) {
				updates.push(outputUrl);
			}
		}

		if (updates.length > 0) {
			if (requiresLayoutRefresh) {
				appLogger.debug(`Layout update detected, sending layout-update event`);
				return {
					type: 'broadcast',
					events: [
						{
							type: 'layout-update',
						},
					],
				};
			}

			appLogger.debug(`Broadcasting ${updates.length} updates`);
			return {
				type: 'broadcast',
				events: updates.map((path) => ({
					type: 'update',
					path,
					timestamp: Date.now(),
				})),
			};
		}

		appLogger.debug(`No updates generated`);
		return { type: 'none' };
	}

	/**
	 * Bundles a single React/MDX entrypoint with HMR support.
	 *
	 * After successful bundling, populates the entrypoint dependency graph with
	 * the build's dependency metadata. This enables selective invalidation on
	 * subsequent file changes, so only entrypoints affected by a changed
	 * dependency are rebuilt.
	 *
	 * @param entrypointPath - Absolute path to the source file
	 * @param outputUrl - URL path for the bundled file
	 * @returns True if bundling was successful
	 */
	private async bundleReactEntrypoint(entrypointPath: string, outputUrl: string): Promise<boolean> {
		try {
			const isMdx = entrypointPath.endsWith('.mdx');
			const { outputPath } = this.getEntrypointOutput(entrypointPath);
			const tempDir = path.dirname(outputPath);

			const cachedDeclared = this.pageMetadataCache.getDeclaredModules(entrypointPath);
			let entrypointDeclaredModules: readonly string[];
			let declaredModules: readonly string[];
			if (cachedDeclared) {
				entrypointDeclaredModules = cachedDeclared;
				declaredModules = cachedDeclared;
			} else {
				entrypointDeclaredModules = isMdx
					? await collectPageDeclaredModules(entrypointPath)
					: collectPageDeclaredModulesFromModule(await this.importNodePageModule(entrypointPath));
				// Populate the cache so subsequent rebuilds (single or grouped)
				// don't re-import the page module on the Node side.
				this.pageMetadataCache.setDeclaredModules(entrypointPath, entrypointDeclaredModules);
				declaredModules = entrypointDeclaredModules;
			}
			const plugins = this.getBuildPlugins(declaredModules);

			if (isMdx && this.mdxCompilerOptions) {
				const mdxPlugin = createReactMdxLoaderPlugin(this.mdxCompilerOptions);
				plugins.unshift(mdxPlugin);
			}

			await this.clearHmrOutdir(tempDir);
			const result = await this.context.getBrowserBundleService().bundle({
				profile: 'hmr-entrypoint',
				entrypoints: [entrypointPath],
				outdir: tempDir,
				naming: `[name].[hash].tmp`,
				plugins,
				minify: false,
			});

			if (!result.success) {
				appLogger.error(`Failed to build ${entrypointPath}:`, result.logs);
				return false;
			}

			if (result.dependencyGraph?.entrypoints) {
				const dependencyGraph = this.context.getEntrypointDependencyGraph();
				for (const [entrypoint, deps] of Object.entries(result.dependencyGraph.entrypoints)) {
					dependencyGraph.setEntrypointDependencies(entrypoint, deps);
				}
			}

			const tempFile = result.outputs[0]?.path;
			if (!tempFile) {
				appLogger.error(`No output file generated for ${entrypointPath}`);
				return false;
			}

			const resolvedTempFile = await this.resolveTempOutputPath(tempFile);
			if (!resolvedTempFile) {
				appLogger.debug(`Skipping stale temp output for ${outputUrl}: ${tempFile}`);
				return false;
			}

			const processed = await this.processOutput(resolvedTempFile, outputPath, outputUrl);
			return processed;
		} catch (error) {
			appLogger.error(`Error bundling ${entrypointPath}:`, error as Error);
			return false;
		}
	}

	/**
	 * Bundles multiple React/MDX entrypoints in a single build pass.
	 *
	 * Uses code splitting to share common dependencies across entrypoints.
	 * After successful bundling, populates the entrypoint dependency graph with
	 * the build's dependency metadata for selective invalidation.
	 *
	 * @param entrypoints - Array of entrypoint paths and their output URLs
	 * @returns Array of output URLs that were successfully built
	 */
	private async bundleReactEntrypoints(entrypoints: ReactHmrBuildTarget[]): Promise<string[]> {
		try {
			const declaredModules = new Set<string>();
			let shouldEnableMdx = false;

			for (const { entrypointPath } of entrypoints) {
				const entrypointDeclaredModules = this.pageMetadataCache.getDeclaredModules(entrypointPath)
					? this.pageMetadataCache.getDeclaredModules(entrypointPath)!
					: entrypointPath.endsWith('.mdx')
						? await collectPageDeclaredModules(entrypointPath)
						: collectPageDeclaredModulesFromModule(await this.importNodePageModule(entrypointPath));

				this.pageMetadataCache.setDeclaredModules(entrypointPath, entrypointDeclaredModules);
				for (const declaredModule of entrypointDeclaredModules) {
					declaredModules.add(declaredModule);
				}

				if (entrypointPath.endsWith('.mdx')) {
					shouldEnableMdx = true;
				}
			}

			const plugins = this.getBuildPlugins([...declaredModules]);
			if (shouldEnableMdx && this.mdxCompilerOptions) {
				plugins.unshift(createReactMdxLoaderPlugin(this.mdxCompilerOptions));
			}

			await this.clearHmrOutdir(this.context.getDistDir());
			const result = await this.context.getBrowserBundleService().bundle({
				profile: 'hmr-entrypoint',
				entrypoints: entrypoints.map(({ entrypointPath }) => entrypointPath),
				outdir: this.context.getDistDir(),
				outbase: this.context.getSrcDir(),
				naming: '[dir]/[name].[hash].tmp',
				splitting: true,
				plugins,
				minify: false,
			});

			if (!result.success) {
				appLogger.error(`Failed to build grouped React entrypoints:`, result.logs);
				return [];
			}

			if (result.dependencyGraph?.entrypoints) {
				const dependencyGraph = this.context.getEntrypointDependencyGraph();
				for (const [entrypoint, deps] of Object.entries(result.dependencyGraph.entrypoints)) {
					dependencyGraph.setEntrypointDependencies(entrypoint, deps);
				}
			}

			const updatedOutputs: string[] = [];
			for (const { entrypointPath, outputUrl } of entrypoints) {
				const { outputPath } = this.getEntrypointOutput(entrypointPath);
				const { outputDir, outputBaseName } = this.getGroupedTempOutputPattern(entrypointPath);
				const tempOutput = result.outputs.find((output) => {
					return (
						path.dirname(output.path) === outputDir &&
						path.basename(output.path).startsWith(`${outputBaseName}.`) &&
						path.basename(output.path).includes('.tmp')
					);
				})?.path;

				const resolvedTempOutput = tempOutput
					? await this.resolveTempOutputPath(tempOutput)
					: await this.resolveTempOutputPath(path.join(outputDir, `${outputBaseName}.[hash].tmp.js`));

				if (!resolvedTempOutput) {
					appLogger.debug(`Missing grouped temp output for ${outputUrl}`);
					continue;
				}

				const processed = await this.processOutput(resolvedTempOutput, outputPath, outputUrl);
				if (processed) {
					updatedOutputs.push(outputUrl);
				}
			}

			return updatedOutputs;
		} catch (error) {
			appLogger.error(`Error bundling grouped React entrypoints:`, error as Error);
			return [];
		}
	}

	private async resolveTempOutputPath(tempPath: string): Promise<string | null> {
		if (fileSystem.exists(tempPath)) {
			return tempPath;
		}

		if (!tempPath.includes('[hash]')) {
			return null;
		}

		const directory = path.dirname(tempPath);
		const pattern = path.basename(tempPath).replaceAll('[hash]', '*');
		const matches = await fileSystem.glob([pattern], { cwd: directory });

		if (matches.length === 0) {
			return null;
		}

		return path.isAbsolute(matches[0]!) ? matches[0]! : path.join(directory, matches[0]!);
	}

	/**
	 * Clears stale HMR output from a directory before a rebuild.
	 *
	 * Only removes:
	 * - `*.tmp.js` files (the per-build esbuild output the strategy owns)
	 * - the `chunks/` subdirectory (esbuild's splitting target)
	 *
	 * The HMR runtime script (`_hmr_runtime.js`) and any user-authored
	 * assets in the outdir are preserved. This is the minimal set of
	 * files that, if left from a previous build, can cause esbuild to
	 * emit `ENOENT` for chunk references that point to entrypoints
	 * whose hash has since changed.
	 */
	private async clearHmrOutdir(outdir: string): Promise<void> {
		if (!fileSystem.exists(outdir)) {
			return;
		}

		const tempFiles = await fileSystem.glob(['**/*.tmp.js'], { cwd: outdir });
		await Promise.all(
			tempFiles.map((relativePath) => {
				const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.join(outdir, relativePath);
				return fileSystem.removeAsync(absolutePath).catch(() => undefined);
			}),
		);

		const chunksDir = path.join(outdir, 'chunks');
		if (fileSystem.exists(chunksDir)) {
			await fileSystem.removeAsync(chunksDir).catch(() => undefined);
		}
	}

	/**
	 * Encodes dynamic route segments (brackets) in file paths.
	 * Converts `[slug]` to `_slug_` to avoid filesystem issues.
	 */
	private encodeDynamicSegments(filepath: string): string {
		return filepath.replace(/\[([^\]]+)\]/g, '_$1_');
	}

	private rewriteChunkImportUrls(code: string): string {
		const hmrChunkBaseUrl = `/${path.join(RESOLVED_ASSETS_DIR, '_hmr').split(path.sep).join('/')}`;

		return code.replace(/(['"])(?:\.\.\/)+(chunk-[^'"]+\.js)\1/g, (_match, quote, chunkFile) => {
			return `${quote}${hmrChunkBaseUrl}/${chunkFile}${quote}`;
		});
	}

	private isMissingTempOutputError(error: unknown): boolean {
		if (error instanceof FileNotFoundError) {
			return true;
		}

		if (!(error instanceof Error)) {
			return false;
		}

		if (error.message.includes('not found') || error.message.includes('ENOENT')) {
			return true;
		}

		const errorCause = error.cause;
		if (errorCause instanceof FileNotFoundError) {
			return true;
		}

		return (
			typeof errorCause === 'object' &&
			errorCause !== null &&
			'code' in errorCause &&
			errorCause.code === 'ENOENT'
		);
	}

	/**
	 * Processes bundled output and injects the React HMR handler.
	 * Writes to temp file first, then renames atomically to avoid conflicts.
	 *
	 * @param tempPath - Path to the temporary bundled file
	 * @param finalPath - Final destination path
	 * @param url - URL path for logging
	 * @returns True if processing was successful
	 */
	private async processOutput(tempPath: string, finalPath: string, url: string): Promise<boolean> {
		if (!fileSystem.exists(tempPath)) {
			appLogger.debug(`Skipping stale temp output for ${url}: ${tempPath}`);
			return false;
		}

		try {
			let code = await fileSystem.readFile(tempPath);

			code = this.rewriteChunkImportUrls(code);
			code = injectHmrHandler(code);

			await fileSystem.writeAsync(finalPath, code);
			await fileSystem.removeAsync(tempPath).catch(() => {});

			appLogger.debug(`Processed ${url} with HMR handler`);
			return true;
		} catch (error) {
			if (this.isMissingTempOutputError(error)) {
				appLogger.debug(`Skipping stale temp output for ${url}: ${tempPath}`);
				await fileSystem.removeAsync(tempPath).catch(() => {});
				return false;
			}

			appLogger.error(`Error processing output for ${url}:`, error as Error);
			await fileSystem.removeAsync(tempPath).catch(() => {});
			return false;
		}
	}
}
