/**
 * React HMR Strategy
 *
 * Handles hot module replacement for React components.
 * Triggers module invalidation on changes to ensure fresh component re-renders.
 *
 * @module
 */

import path from 'node:path';
import fs from 'node:fs';

import { HmrStrategy, HmrStrategyType, type HmrAction } from '@ecopages/core/hmr/hmr-strategy';
import { isRegisteredScriptEntrypoint } from '@ecopages/core/hmr/hmr-entrypoint-output';
import { DEV_TRANSFORM_URL_PREFIX } from '@ecopages/core/dev/transform-server';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import { createBrowserRuntimePlugin } from '@ecopages/core/build/browser-runtime-plugin';
import type { BrowserRuntimeManifest } from '@ecopages/core/build/browser-runtime-manifest';
import type { ResolvedHmrEntrypoint } from '@ecopages/core';
import {
	getDevHmrEntrypointCacheEntry,
	removeDevHmrEntrypointCacheEntry,
	setDevHmrEntrypointCacheEntry,
	type DevHmrEntrypointCache,
} from '@ecopages/core/build/dev-hmr-entrypoint-cache';
import { fileSystem } from '@ecopages/file-system';
import { Logger } from '@ecopages/logger';
import type { DefaultHmrContext } from '@ecopages/core';
import type { CompileOptions } from '@mdx-js/mdx';
import { createClientGraphBoundaryPlugin } from '../client-graph/boundary-plugin.ts';
import { ClientGraphBoundaryCache } from '../client-graph/boundary-cache.ts';
import { someInConfigTree } from '../client-graph/component-config-traversal.ts';
import { getReactClientGraphAllowSpecifiers } from '../bundling/runtime-alias-map.ts';
import type { HmrPageMetadataCache } from './page-metadata-cache.ts';
import type { EcoComponentConfig } from '@ecopages/core';
import { ReactHmrDiskBundler, type ReactHmrBuildTarget } from './react-hmr-disk-bundler.ts';

const appLogger = new Logger('[ReactHmrStrategy]');

/** Entrypoints emitted per grouped Rolldown pass during the cold client graph build. */
const COLD_BATCH_CHUNK_SIZE = 25;

export type ColdClientGraphDependencies = {
	templateRouteFilePaths: readonly string[];
	tryTrackInFlightEntrypoint: (entrypointPath: string, promise: Promise<ResolvedHmrEntrypoint>) => boolean;
	releaseInFlightEntrypoint: (entrypointPath: string) => void;
	getMissingEntrypointError: (entrypointPath: string, outputPath: string) => Error;
};

type ColdClientGraphTarget = {
	entrypointPath: string;
	outputPath: string;
	outputUrl: string;
};

export interface ReactHmrStrategyOptions {
	context: DefaultHmrContext;
	pageMetadataCache: HmrPageMetadataCache;
	runtimeManifest: BrowserRuntimeManifest;
	mdxCompilerOptions?: CompileOptions;
	ownedTemplateExtensions?: string[];
	allTemplateExtensions?: string[];
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
 * Strategy for handling React component HMR updates.
 */
export class ReactHmrStrategy extends HmrStrategy {
	readonly type = HmrStrategyType.INTEGRATION;
	private mdxCompilerOptions?: CompileOptions;
	private readonly ownedTemplateExtensions: Set<string>;
	private readonly allTemplateExtensions: string[];
	private readonly context: DefaultHmrContext;
	private readonly pageMetadataCache: HmrPageMetadataCache;
	private readonly runtimeManifest: BrowserRuntimeManifest;
	private readonly clientGraphBoundaryCache: ClientGraphBoundaryCache;
	private readonly diskBundler: ReactHmrDiskBundler;
	private devHmrEntrypointCache?: DevHmrEntrypointCache;

	private async importNodePageModule(entrypointPath: string): Promise<ImportedReactPageModule> {
		return await this.context.importServerModule(entrypointPath);
	}

	constructor(options: ReactHmrStrategyOptions) {
		super();
		this.context = options.context;
		this.pageMetadataCache = options.pageMetadataCache;
		this.runtimeManifest = options.runtimeManifest;
		this.clientGraphBoundaryCache = options.clientGraphBoundaryCache ?? new ClientGraphBoundaryCache();
		this.mdxCompilerOptions = options.mdxCompilerOptions;
		this.ownedTemplateExtensions = new Set(options.ownedTemplateExtensions ?? ['.tsx']);
		this.allTemplateExtensions = [...(options.allTemplateExtensions ?? ['.tsx'])].sort(
			(a, b) => b.length - a.length,
		);
		this.diskBundler = new ReactHmrDiskBundler({
			context: this.context,
			pageMetadataCache: this.pageMetadataCache,
			mdxCompilerOptions: this.mdxCompilerOptions,
			getBuildPlugins: (declaredModules) => this.getBuildPlugins(declaredModules),
			importNodePageModule: (entrypointPath) => this.importNodePageModule(entrypointPath),
		});
	}

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
				projectRoot: path.dirname(this.context.getSrcDir()),
				absWorkingDir: path.dirname(this.context.getSrcDir()),
				alwaysAllowSpecifiers: allowSpecifiers,
				declaredModules,
				cache: this.clientGraphBoundaryCache,
			}),
			...(runtimeRewritePlugin ? [runtimeRewritePlugin] : []),
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

	private isDevTransformOutputUrl(outputUrl: string): boolean {
		return outputUrl.startsWith(`${DEV_TRANSFORM_URL_PREFIX}/`);
	}

	private queueDevTransformOutputUpdates(
		targets: readonly ReactHmrBuildTarget[],
		requestedOutputUrls: ReadonlySet<string>,
		updates: string[],
	): void {
		for (const { outputUrl } of targets) {
			if (requestedOutputUrls.has(outputUrl)) {
				updates.push(outputUrl);
			}
		}
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
			return (config?.layouts ?? []).some((layout) => this.configContainsFile(layout?.config, filePath));
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

	matches(filePath: string): boolean {
		const watchedFiles = this.context.getWatchedFiles();
		const resolvedFilePath = path.resolve(filePath);
		appLogger.debug(`Checking ${filePath}. Watched: ${watchedFiles.size}`);

		if (isRegisteredScriptEntrypoint(this.context.getRegisteredEntrypoints(), resolvedFilePath)) {
			return false;
		}

		if (watchedFiles.has(resolvedFilePath)) {
			if (this.ownsWatchedEntrypoint(resolvedFilePath)) {
				return true;
			}

			const outputUrl = watchedFiles.get(resolvedFilePath);
			if (outputUrl && this.isDevTransformOutputUrl(outputUrl) && this.isReactEntrypoint(resolvedFilePath)) {
				return true;
			}

			return false;
		}

		const dependencyHits = this.context.getEntrypointDependencyGraph().getDependencyEntrypoints(resolvedFilePath);
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

	override ownsDevTransformEntrypoint(entrypointPath: string): boolean {
		if (!this.isReactEntrypoint(entrypointPath)) {
			return false;
		}

		return (
			this.ownsWatchedEntrypoint(entrypointPath) ||
			isRegisteredScriptEntrypoint(this.context.getRegisteredEntrypoints(), entrypointPath)
		);
	}

	async createDevTransformPlugins(entrypointPath: string): Promise<EcoBuildPlugin[]> {
		const declaredModules = await this.diskBundler.resolveDeclaredModulesForEntrypoint(entrypointPath);
		return this.diskBundler.buildPluginsForDeclaredModules(declaredModules, entrypointPath.endsWith('.mdx'));
	}

	private isLayoutFile(filePath: string): boolean {
		return filePath.startsWith(this.context.getLayoutsDir());
	}

	private isPageEntrypoint(filePath: string): boolean {
		return filePath.startsWith(this.context.getPagesDir()) && this.isReactEntrypoint(filePath);
	}

	/**
	 * @remarks
	 * Dev transform pages register `__eco_dev__` URLs while legacy HMR emits use
	 * `_hmr` disk paths. Grouped page rebuilds must preserve the registered URL
	 * so update broadcasts match client `hmrHandlers` keys.
	 */
	private resolveEntrypointOutputUrl(entrypointPath: string): string {
		const watchedOutputUrl = this.context.getWatchedFiles().get(path.resolve(entrypointPath));
		if (watchedOutputUrl) {
			return watchedOutputUrl;
		}

		return this.diskBundler.getEntrypointOutput(entrypointPath).outputUrl;
	}

	private async collectReactPageBuildTargets(): Promise<ReactHmrBuildTarget[]> {
		const targets = new Map<string, ReactHmrBuildTarget>();

		for (const entrypointPath of this.pageMetadataCache.getOwnedEntrypoints()) {
			if (!this.isPageEntrypoint(entrypointPath)) {
				continue;
			}

			targets.set(entrypointPath, {
				entrypointPath,
				outputUrl: this.resolveEntrypointOutputUrl(entrypointPath),
			});
		}

		return Array.from(targets.values()).sort((left, right) =>
			left.entrypointPath.localeCompare(right.entrypointPath),
		);
	}

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
			if (!groupedTargets.has(target.entrypointPath)) {
				groupedTargets.set(target.entrypointPath, target);
			}
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

	async process(_filePath: string): Promise<HmrAction> {
		appLogger.debug(`Processing ${_filePath}`);
		const resolvedFilePath = path.resolve(_filePath);
		const watchedFiles = this.context.getWatchedFiles();

		if (watchedFiles.size === 0) {
			appLogger.debug(`No watched files`);
			return { type: 'none' };
		}

		const isLayout = this.isLayoutFile(resolvedFilePath);
		const isChangedPageEntrypoint = this.isPageEntrypoint(resolvedFilePath);
		if (isLayout) {
			appLogger.debug(`Detected layout file change: ${resolvedFilePath}`);
		}

		const changedEntrypointOutput = watchedFiles.get(resolvedFilePath);
		if (changedEntrypointOutput && !this.ownsWatchedEntrypoint(resolvedFilePath)) {
			if (this.isReactEntrypoint(resolvedFilePath)) {
				this.pageMetadataCache.markOwnedEntrypoint(resolvedFilePath);
			} else {
				appLogger.debug(`Skipping non-React watched entrypoint: ${resolvedFilePath}`);
				return { type: 'none' };
			}
		}

		const dependencyHits = this.context.getEntrypointDependencyGraph().getDependencyEntrypoints(resolvedFilePath);
		const hasDependencyHits = dependencyHits.size > 0;
		const affectedEntrypoints = new Map<string, string>();
		let hasOwnedLayoutDependencyHit = false;
		let layoutOwnedPageTargets: ReactHmrBuildTarget[] = [];
		let hasLayoutOwnedRequestedTarget = false;

		if (hasDependencyHits && !changedEntrypointOutput) {
			for (const entrypoint of dependencyHits) {
				const resolvedEntrypoint = path.resolve(entrypoint);
				const outputUrl = watchedFiles.get(resolvedEntrypoint);
				if (
					outputUrl &&
					(this.ownsWatchedEntrypoint(resolvedEntrypoint) || this.isDevTransformOutputUrl(outputUrl))
				) {
					affectedEntrypoints.set(resolvedEntrypoint, outputUrl);
					continue;
				}

				if (this.isLayoutFile(resolvedEntrypoint) && this.ownsWatchedEntrypoint(resolvedEntrypoint)) {
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
				resolvedFilePath,
				layoutOwnedPageTargets,
			);
		}

		const requestedTargets = changedEntrypointOutput
			? hasLayoutOwnedRequestedTarget
				? [{ entrypointPath: resolvedFilePath, outputUrl: changedEntrypointOutput }, ...layoutOwnedPageTargets]
				: [{ entrypointPath: resolvedFilePath, outputUrl: changedEntrypointOutput }]
			: hasOwnedLayoutDependencyHit
				? await this.collectReactPageBuildTargets()
				: hasDependencyHits
					? Array.from(affectedEntrypoints, ([entrypointPath, outputUrl]) => ({ entrypointPath, outputUrl }))
					: Array.from(watchedFiles, ([entrypointPath, outputUrl]) => ({ entrypointPath, outputUrl }));

		const groupedPageTargets = await this.resolveBuildTargets(requestedTargets, resolvedFilePath);
		const { pageTargets, nonPageTargets } = this.partitionBuildTargets(requestedTargets, groupedPageTargets);
		if (!changedEntrypointOutput) {
			hasLayoutOwnedRequestedTarget = await this.hasLayoutOwnedDependencyTarget(
				resolvedFilePath,
				requestedTargets,
			);
		}
		const requiresLayoutRefresh = isLayout || hasOwnedLayoutDependencyHit || hasLayoutOwnedRequestedTarget;

		this.invalidateColdGraphCacheForPaths([
			...pageTargets.map((target) => target.entrypointPath),
			...nonPageTargets.map((target) => target.entrypointPath),
		]);

		await this.diskBundler.clearOutdirsForTargets(nonPageTargets);

		const updates: string[] = [];
		const requestedOutputUrls = new Set(requestedTargets.map((target) => target.outputUrl));
		this.queueDevTransformOutputUpdates(pageTargets, requestedOutputUrls, updates);

		for (const { entrypointPath, outputUrl } of nonPageTargets) {
			if (!this.isReactEntrypoint(entrypointPath)) {
				continue;
			}

			if (this.isDevTransformOutputUrl(outputUrl)) {
				if (requestedOutputUrls.has(outputUrl)) {
					updates.push(outputUrl);
				}
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

	private async bundleReactEntrypoint(entrypointPath: string, outputUrl: string): Promise<boolean> {
		return this.diskBundler.bundleEntrypoint(entrypointPath, outputUrl);
	}

	private async bundleReactEntrypoints(entrypoints: ReactHmrBuildTarget[]): Promise<string[]> {
		return this.diskBundler.bundleEntrypoints(entrypoints);
	}

	private async processOutput(tempPath: string, finalPath: string, url: string): Promise<boolean> {
		return this.diskBundler.processOutput(tempPath, finalPath, url);
	}

	private getRolldownEntryKey(entrypointPath: string): string {
		return this.diskBundler.getRolldownEntryKey(entrypointPath);
	}

	private async resolveTempOutputPath(tempPath: string): Promise<string | null> {
		return this.diskBundler.resolveTempOutputPath(tempPath);
	}

	private async clearHmrOutdir(outdir: string): Promise<void> {
		return this.diskBundler.clearHmrOutdir(outdir);
	}

	/**
	 * Builds the full client HMR graph in grouped Rolldown passes during server startup.
	 *
	 * @remarks
	 * Discovers React page entrypoints from the route registry (with a pages-dir
	 * fallback), seeds cache hits immediately, and builds uncached chunks in the
	 * background. In-flight promises are registered before each grouped build so
	 * concurrent SSR callers coalesce on the same work.
	 */
	async prepareColdClientGraph(
		cache: DevHmrEntrypointCache,
		dependencies: ColdClientGraphDependencies,
	): Promise<void> {
		this.devHmrEntrypointCache = cache;
		const entrypoints = await this.discoverColdClientGraphEntrypoints(dependencies.templateRouteFilePaths);
		if (entrypoints.length === 0) {
			return;
		}

		appLogger.debug(`Preparing cold client graph for ${entrypoints.length} React entrypoints`);

		for (let index = 0; index < entrypoints.length; index += COLD_BATCH_CHUNK_SIZE) {
			const chunk = entrypoints.slice(index, index + COLD_BATCH_CHUNK_SIZE);
			const targets = chunk.map((entrypointPath) => {
				const { outputPath, outputUrl } = this.getEntrypointOutput(entrypointPath);
				return { entrypointPath, outputPath, outputUrl };
			});

			const cachedTargets: ColdClientGraphTarget[] = [];
			const uncachedTargets: ColdClientGraphTarget[] = [];

			for (const target of targets) {
				const hit = getDevHmrEntrypointCacheEntry(cache, target.entrypointPath);
				if (hit && fileSystem.exists(hit.outputPath)) {
					cachedTargets.push({
						entrypointPath: target.entrypointPath,
						outputPath: hit.outputPath,
						outputUrl: hit.outputUrl,
					});
				} else {
					uncachedTargets.push(target);
				}
			}

			for (const target of cachedTargets) {
				this.context.seedResolvedEntrypoint({
					sourcePath: target.entrypointPath,
					outputPath: target.outputPath,
					outputUrl: target.outputUrl,
				});
			}

			if (uncachedTargets.length === 0) {
				continue;
			}

			await this.materializeUncachedColdClientGraphChunk(uncachedTargets, cache, dependencies);
		}
	}

	private async discoverColdClientGraphEntrypoints(templateRouteFilePaths: readonly string[]): Promise<string[]> {
		const fromRoutes = this.collectReactEntrypointsFromRouteFiles(templateRouteFilePaths);
		if (fromRoutes.length > 0) {
			return fromRoutes;
		}

		return this.discoverReactEntrypointsFromPagesDir();
	}

	private collectReactEntrypointsFromRouteFiles(templateRouteFilePaths: readonly string[]): string[] {
		const seen = new Set<string>();
		const entrypoints: string[] = [];

		for (const filePath of templateRouteFilePaths) {
			if (!this.isReactEntrypoint(filePath) || !this.isPageEntrypoint(filePath)) {
				continue;
			}

			const normalized = path.resolve(filePath);
			if (seen.has(normalized)) {
				continue;
			}

			seen.add(normalized);
			this.pageMetadataCache.markOwnedEntrypoint(filePath);
			entrypoints.push(filePath);
		}

		return entrypoints.sort((left, right) => left.localeCompare(right));
	}

	private discoverReactEntrypointsFromPagesDir(): string[] {
		const pagesDir = this.context.getPagesDir();
		const files: string[] = [];

		const walk = (dir: string): void => {
			if (!fileSystem.exists(dir)) {
				return;
			}

			let entries: fs.Dirent[];
			try {
				entries = fs.readdirSync(dir, { withFileTypes: true });
			} catch {
				return;
			}

			for (const entry of entries) {
				const entryPath = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					walk(entryPath);
					continue;
				}

				if (/\.(tsx?|jsx?|mdx)$/.test(entry.name)) {
					files.push(entryPath);
				}
			}
		};

		walk(pagesDir);

		const seen = new Set<string>();
		const entrypoints: string[] = [];

		for (const filePath of files) {
			let source: string;
			try {
				source = fs.readFileSync(filePath, 'utf8');
			} catch {
				continue;
			}

			if (!/\beco\.page(?:<[^>]*>)?\s*\(/.test(source)) {
				continue;
			}

			if (!this.isReactEntrypoint(filePath) || !this.isPageEntrypoint(filePath)) {
				continue;
			}

			const normalized = path.resolve(filePath);
			if (seen.has(normalized)) {
				continue;
			}

			seen.add(normalized);
			this.pageMetadataCache.markOwnedEntrypoint(filePath);
			entrypoints.push(filePath);
		}

		return entrypoints.sort((left, right) => left.localeCompare(right));
	}

	private async materializeUncachedColdClientGraphChunk(
		uncachedTargets: ColdClientGraphTarget[],
		cache: DevHmrEntrypointCache,
		dependencies: ColdClientGraphDependencies,
	): Promise<void> {
		type ChunkResult = Map<string, ResolvedHmrEntrypoint>;
		let resolveChunk!: (value: ChunkResult) => void;
		let rejectChunk!: (reason?: unknown) => void;
		const chunkPromise = new Promise<ChunkResult>((resolve, reject) => {
			resolveChunk = resolve;
			rejectChunk = reject;
		});

		const targetsToBuild: ColdClientGraphTarget[] = [];
		for (const target of uncachedTargets) {
			const normalizedEntrypoint = path.resolve(target.entrypointPath);
			const inFlightPromise = chunkPromise.then((built) => {
				const resolved = built.get(normalizedEntrypoint);
				if (!resolved) {
					throw dependencies.getMissingEntrypointError(target.entrypointPath, target.outputPath);
				}

				return resolved;
			});

			if (dependencies.tryTrackInFlightEntrypoint(target.entrypointPath, inFlightPromise)) {
				targetsToBuild.push(target);
			}
		}

		if (targetsToBuild.length === 0) {
			return;
		}

		try {
			const builtUrls = await this.bundleReactBuildTargets(
				targetsToBuild.map((target) => ({
					entrypointPath: target.entrypointPath,
					outputUrl: target.outputUrl,
				})),
				{ grouped: true },
			);
			const builtUrlSet = new Set(builtUrls);
			const built = new Map<string, ResolvedHmrEntrypoint>();

			for (const target of targetsToBuild) {
				if (!builtUrlSet.has(target.outputUrl) || !fileSystem.exists(target.outputPath)) {
					continue;
				}

				const resolved: ResolvedHmrEntrypoint = {
					sourcePath: target.entrypointPath,
					outputPath: target.outputPath,
					outputUrl: target.outputUrl,
				};
				built.set(path.resolve(target.entrypointPath), resolved);

				this.context.seedResolvedEntrypoint(resolved);

				let sourceMtimeMs = 0;
				try {
					sourceMtimeMs = fs.statSync(target.entrypointPath).mtimeMs;
				} catch {
					// leave mtime at 0; the next session will rebuild defensively
				}

				setDevHmrEntrypointCacheEntry(cache, target.entrypointPath, {
					outputPath: target.outputPath,
					outputUrl: target.outputUrl,
					sourceMtimeMs,
					builtAt: Date.now(),
				});
			}

			resolveChunk(built);
			await chunkPromise;
		} catch (error) {
			rejectChunk(error);
			throw error;
		} finally {
			for (const target of targetsToBuild) {
				dependencies.releaseInFlightEntrypoint(target.entrypointPath);
			}
		}
	}

	private invalidateColdGraphCacheForPaths(entrypointPaths: string[]): void {
		if (!this.devHmrEntrypointCache) {
			return;
		}

		for (const entrypointPath of entrypointPaths) {
			removeDevHmrEntrypointCacheEntry(this.devHmrEntrypointCache, entrypointPath);
		}
	}
}
