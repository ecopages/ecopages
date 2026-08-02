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
import { isRegisteredScriptEntrypoint } from '@ecopages/core/hmr/hmr-entrypoint-output';
import { DEV_TRANSFORM_URL_PREFIX } from '@ecopages/core/dev/transform-server';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import { createBrowserRuntimePlugin } from '@ecopages/core/build/browser-runtime-plugin';
import type { BrowserRuntimeManifest } from '@ecopages/core/build/browser-runtime-manifest';
import { Logger } from '@ecopages/logger';
import type { DefaultHmrContext } from '@ecopages/core';
import type { CompileOptions } from '@mdx-js/mdx';
import { createClientGraphBoundaryPlugin } from '../client-graph/boundary-plugin.ts';
import { ClientGraphBoundaryCache } from '../client-graph/boundary-cache.ts';
import { someInConfigTree } from '../client-graph/component-config-traversal.ts';
import { getReactClientGraphAllowSpecifiers } from '../bundling/runtime-alias-map.ts';
import type { HmrPageMetadataCache } from './page-metadata-cache.ts';
import { getComponentIdentity, type EcoComponentConfig } from '@ecopages/core';
import {
	buildReactDevTransformPlugins,
	resolveReactDeclaredModulesForEntrypoint,
	type ReactHmrBuildTarget,
} from './react-hmr-dev-transform-plugins.ts';

const appLogger = new Logger('[ReactHmrStrategy]');

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

	private async importNodePageModule(entrypointPath: string): Promise<ImportedReactPageModule> {
		return await this.context.importServerModule(entrypointPath);
	}

	private getDevTransformPluginOptions() {
		return {
			pageMetadataCache: this.pageMetadataCache,
			mdxCompilerOptions: this.mdxCompilerOptions,
			getBuildPlugins: (declaredModules?: readonly string[]) => this.getBuildPlugins(declaredModules),
			importNodePageModule: (entrypointPath: string) => this.importNodePageModule(entrypointPath),
		};
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
			const identity = getComponentIdentity(node);
			if (!identity?.file) {
				return false;
			}

			return path.resolve(identity.file) === resolvedFilePath;
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

	override ownsDevTransformEntrypoint(sourcePath: string): boolean {
		if (!this.isReactEntrypoint(sourcePath)) {
			return false;
		}

		const normalized = path.resolve(sourcePath);
		const srcDir = path.resolve(this.context.getSrcDir());
		return normalized === srcDir || normalized.startsWith(`${srcDir}${path.sep}`);
	}

	getRuntimeManifest(): BrowserRuntimeManifest {
		return this.runtimeManifest;
	}

	async getVendorBundlePlugins(): Promise<readonly EcoBuildPlugin[]> {
		return this.getBuildPlugins();
	}

	async createDevTransformPlugins(sourcePath: string): Promise<EcoBuildPlugin[]> {
		const shouldResolveDeclaredModules = this.isPageEntrypoint(sourcePath) || sourcePath.endsWith('.mdx');
		const declaredModules = shouldResolveDeclaredModules
			? await resolveReactDeclaredModulesForEntrypoint(this.getDevTransformPluginOptions(), sourcePath)
			: [];

		return buildReactDevTransformPlugins(
			this.getDevTransformPluginOptions(),
			declaredModules,
			sourcePath.endsWith('.mdx'),
		);
	}

	private isLayoutFile(filePath: string): boolean {
		return filePath.startsWith(this.context.getLayoutsDir());
	}

	private isPageEntrypoint(filePath: string): boolean {
		return filePath.startsWith(this.context.getPagesDir()) && this.isReactEntrypoint(filePath);
	}

	private resolveEntrypointOutputUrl(entrypointPath: string): string | undefined {
		return this.context.getWatchedFiles().get(path.resolve(entrypointPath));
	}

	private async collectReactPageBuildTargets(): Promise<ReactHmrBuildTarget[]> {
		const targets = new Map<string, ReactHmrBuildTarget>();

		for (const entrypointPath of this.pageMetadataCache.getOwnedEntrypoints()) {
			if (!this.isPageEntrypoint(entrypointPath)) {
				continue;
			}

			const outputUrl = this.resolveEntrypointOutputUrl(entrypointPath);
			if (!outputUrl) {
				continue;
			}

			targets.set(entrypointPath, {
				entrypointPath,
				outputUrl,
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
				if (!isLayout) {
					appLogger.debug(`Dependency hits found but none map to React-owned watched entrypoints`);
					return { type: 'none' };
				}
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

		const updates: string[] = [];
		const requestedOutputUrls = new Set(requestedTargets.map((target) => target.outputUrl));
		this.queueDevTransformOutputUpdates(pageTargets, requestedOutputUrls, updates);

		for (const { outputUrl } of nonPageTargets) {
			if (!requestedOutputUrls.has(outputUrl)) {
				continue;
			}

			if (this.isDevTransformOutputUrl(outputUrl)) {
				updates.push(outputUrl);
				continue;
			}

			appLogger.debug(`Skipping non-dev-transform HMR output: ${outputUrl}`);
		}

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

		if (updates.length > 0) {
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
}
