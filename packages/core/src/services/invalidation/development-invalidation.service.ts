import path from 'node:path';
import { isDevEnvFilePath } from '../../dev/development-restart-watch-paths.ts';
import { matchesAdditionalWatchPath, resolveAdditionalWatchPath } from '../../utils/additional-watch-paths.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { isPathInside } from '../../utils/path-containment.ts';
import { getAppServerInvalidationState } from '../runtime-state/server-invalidation-state.service.ts';
import { clearAppDevelopmentRouteModuleBuildCaches } from '../module-loading/route-module-build-cache-registry.ts';
import { clearCollectionServerBuildArtifacts } from '../module-loading/collection-server-module-build.service.ts';
import { clearAppPageCache, invalidateAppPageCacheBySourcePaths } from '../cache/page-cache-service.ts';
import { getAppPageBrowserGraphSession } from '../../route-renderer/orchestration/page-browser-graph/page-browser-graph-session.ts';
import { getAppBuildInputIndex } from '../../build/cache/build-input-dependency-index.ts';

export type DevelopmentInvalidationCategory =
	| 'public-asset'
	| 'additional-watch'
	| 'include-source'
	| 'explicit-server-view'
	| 'route-source'
	| 'processor-owned-asset'
	| 'recorded-input'
	| 'server-source'
	| 'runtime-restart'
	| 'other';

/**
 * Framework-owned invalidation plan for one changed file.
 *
 * @remarks
 * This is the explicit invalidation matrix Workstream 4 needs. Watchers and
 * runtime adapters consume this plan instead of encoding file-category rules in
 * host-specific control flow.
 */
export interface DevelopmentInvalidationPlan {
	category: DevelopmentInvalidationCategory;
	invalidateServerModules: boolean;
	refreshRoutes: boolean;
	reloadBrowser: boolean;
	delegateToHmr: boolean;
	processorHandledAsset: boolean;
}

/**
 * One debounce window of filesystem events, grouped by kind.
 *
 * @remarks
 * `created` stays separate from `changed` because new Page files refresh the
 * Route Registry. Later events for the same path win when a batch contains
 * more than one kind.
 */
export interface DevFileChanges {
	changed: readonly string[];
	created: readonly string[];
	deleted: readonly string[];
}

export type DevFileChangeKind = 'changed' | 'created' | 'deleted';

export interface AppliedDevFileChange {
	filePath: string;
	kind: DevFileChangeKind;
	plan: DevelopmentInvalidationPlan;
}

/**
 * Result of applying one batch of development file changes.
 *
 * @remarks
 * Caches are marked dirty here. Rebuild happens on the next request that
 * needs a result, not when the filesystem event arrives.
 */
export interface AppliedDevFileChanges {
	files: AppliedDevFileChange[];
	invalidateServerModules: boolean;
	refreshRoutes: boolean;
	reloadBrowser: boolean;
	delegateToHmr: boolean;
}

/**
 * Framework-owned development invalidation service.
 *
 * @remarks
 * This service centralizes two responsibilities:
 * - file-change classification for watcher behavior
 * - app-owned server-module invalidation
 *
 * Hosts and watchers should ask this service what a file change means instead
 * of deciding invalidation semantics inline.
 */
export class DevelopmentInvalidationService {
	private readonly appConfig: EcoPagesAppConfig;

	constructor(appConfig: EcoPagesAppConfig) {
		this.appConfig = appConfig;
	}

	/**
	 * Invalidates the app-owned server-module graph.
	 */
	invalidateServerModules(changedFiles?: string[]): void {
		getAppServerInvalidationState(this.appConfig).invalidateServerModules(changedFiles);
		this.appConfig.runtime?.appModuleLoader?.invalidateDevelopmentGraph();
		clearAppDevelopmentRouteModuleBuildCaches(this.appConfig);
		clearCollectionServerBuildArtifacts(this.appConfig);

		for (const processor of this.appConfig.processors.values()) {
			processor.invalidateServerArtifacts?.();
		}
	}

	/**
	 * Plans one filesystem batch and marks affected results dirty without rebuilding them.
	 */
	async applyDevFileChanges(changes: DevFileChanges): Promise<AppliedDevFileChanges> {
		const files = this.collectAppliedFiles(changes);
		const applied = this.summarizeAppliedFiles(files);
		await this.markAppliedFilesDirty(files, applied);
		return applied;
	}

	private collectAppliedFiles(changes: DevFileChanges): AppliedDevFileChange[] {
		const byPath = new Map<string, DevFileChangeKind>();
		for (const filePath of changes.changed) {
			byPath.set(path.resolve(filePath), 'changed');
		}
		for (const filePath of changes.created) {
			byPath.set(path.resolve(filePath), 'created');
		}
		for (const filePath of changes.deleted) {
			byPath.set(path.resolve(filePath), 'deleted');
		}

		const files: AppliedDevFileChange[] = [];
		for (const [filePath, kind] of byPath) {
			files.push({ filePath, kind, plan: this.planFileChange(filePath) });
		}
		return files;
	}

	private summarizeAppliedFiles(files: AppliedDevFileChange[]): AppliedDevFileChanges {
		let invalidateServerModules = false;
		let refreshRoutes = false;
		let reloadBrowser = false;
		let delegateToHmr = false;

		for (const file of files) {
			invalidateServerModules ||= file.plan.invalidateServerModules;
			refreshRoutes ||= file.plan.refreshRoutes;
			reloadBrowser ||= file.plan.reloadBrowser;
			delegateToHmr ||= file.plan.delegateToHmr;
		}

		return { files, invalidateServerModules, refreshRoutes, reloadBrowser, delegateToHmr };
	}

	private async markAppliedFilesDirty(files: AppliedDevFileChange[], applied: AppliedDevFileChanges): Promise<void> {
		if (applied.invalidateServerModules) {
			this.invalidateServerModules(
				files.filter((file) => file.plan.invalidateServerModules).map((file) => file.filePath),
			);
		}

		await this.invalidatePageHtmlCache(files);
		this.invalidatePageBrowserGraphs(files);
	}

	private async invalidatePageHtmlCache(files: AppliedDevFileChange[]): Promise<void> {
		if (files.some((file) => shouldClearAllPageHtmlCache(file.plan.category))) {
			await clearAppPageCache(this.appConfig);
			return;
		}

		const sourcePaths = files
			.filter((file) => file.plan.category !== 'public-asset' && file.plan.category !== 'runtime-restart')
			.map((file) => file.filePath);
		if (sourcePaths.length === 0) {
			return;
		}

		await invalidateAppPageCacheBySourcePaths(this.appConfig, sourcePaths);
	}

	private invalidatePageBrowserGraphs(files: AppliedDevFileChange[]): void {
		const session = getAppPageBrowserGraphSession(this.appConfig);
		for (const file of files) {
			session.invalidateByFilePath(file.filePath);
			if (file.plan.category === 'route-source' && file.kind !== 'changed') {
				session.invalidateByRouteFile(file.filePath);
			}
		}
	}

	/**
	 * Classifies one changed file into an explicit framework invalidation plan.
	 */
	planFileChange(filePath: string): DevelopmentInvalidationPlan {
		if (this.isRuntimeRestartFile(filePath)) {
			return {
				category: 'runtime-restart',
				invalidateServerModules: false,
				refreshRoutes: false,
				reloadBrowser: false,
				delegateToHmr: false,
				processorHandledAsset: false,
			};
		}

		if (this.isPublicDirFile(filePath)) {
			return {
				category: 'public-asset',
				invalidateServerModules: false,
				refreshRoutes: false,
				reloadBrowser: true,
				delegateToHmr: false,
				processorHandledAsset: false,
			};
		}

		if (this.matchesAdditionalWatchPaths(filePath)) {
			return {
				category: 'additional-watch',
				invalidateServerModules: true,
				refreshRoutes: false,
				reloadBrowser: true,
				delegateToHmr: false,
				processorHandledAsset: false,
			};
		}

		if (this.isProcessorOwnedAsset(filePath)) {
			return {
				category: 'processor-owned-asset',
				invalidateServerModules: false,
				refreshRoutes: false,
				reloadBrowser: false,
				delegateToHmr: false,
				processorHandledAsset: true,
			};
		}

		if (this.isRouteSourceFile(filePath)) {
			return {
				category: 'route-source',
				invalidateServerModules: true,
				refreshRoutes: true,
				reloadBrowser: false,
				delegateToHmr: true,
				processorHandledAsset: false,
			};
		}

		if (getAppBuildInputIndex(this.appConfig).hasSourcePath(filePath)) {
			return {
				category: 'recorded-input',
				invalidateServerModules: true,
				refreshRoutes: false,
				reloadBrowser: false,
				delegateToHmr: true,
				processorHandledAsset: false,
			};
		}

		if (this.isIncludeSourceFile(filePath)) {
			return {
				category: 'include-source',
				invalidateServerModules: true,
				refreshRoutes: false,
				reloadBrowser: false,
				delegateToHmr: true,
				processorHandledAsset: false,
			};
		}

		if (this.isExplicitServerViewFile(filePath)) {
			return {
				category: 'explicit-server-view',
				invalidateServerModules: true,
				refreshRoutes: false,
				reloadBrowser: false,
				delegateToHmr: true,
				processorHandledAsset: false,
			};
		}

		if (this.isServerModuleSourceFile(filePath)) {
			return {
				category: 'server-source',
				invalidateServerModules: true,
				refreshRoutes: false,
				reloadBrowser: false,
				delegateToHmr: true,
				processorHandledAsset: false,
			};
		}

		return {
			category: 'other',
			invalidateServerModules: false,
			refreshRoutes: false,
			reloadBrowser: false,
			delegateToHmr: true,
			processorHandledAsset: false,
		};
	}

	/**
	 * Returns whether a config, config-imported, or dotenv edit should restart the development process.
	 */
	isRuntimeRestartFile(filePath: string): boolean {
		return this.isConfigImportedFile(filePath) || isDevEnvFilePath(filePath, this.appConfig.rootDir);
	}

	/** Returns whether `filePath` is the resolved application config module. */
	isConfigModuleFile(filePath: string): boolean {
		const resolvedPath = path.resolve(filePath);
		const configPath = this.appConfig.absolutePaths?.config
			? path.resolve(this.appConfig.absolutePaths.config)
			: undefined;

		return configPath !== undefined && resolvedPath === configPath;
	}

	/**
	 * Returns whether `filePath` is the config module or a project file it imports.
	 *
	 * @remarks
	 * Entry watchers own only `eco.config.ts`. Imported files still restart through
	 * the Project Watcher so plugin options cannot stay stale under `dev:watch`.
	 */
	private isConfigImportedFile(filePath: string): boolean {
		const resolvedPath = path.resolve(filePath);
		const files = this.appConfig.absolutePaths?.configModuleFiles;
		if (files?.length) {
			return files.some((file) => path.resolve(file) === resolvedPath);
		}

		return this.isConfigModuleFile(filePath);
	}

	/**
	 * Returns whether the file lives under the public directory.
	 */
	isPublicDirFile(filePath: string): boolean {
		return isPathInside(filePath, this.appConfig.absolutePaths.publicDir);
	}

	/**
	 * Returns whether the file matches `additionalWatchPaths`.
	 */
	matchesAdditionalWatchPaths(filePath: string): boolean {
		return this.appConfig.additionalWatchPaths.some((pattern) =>
			matchesAdditionalWatchPath(filePath, resolveAdditionalWatchPath(pattern, this.appConfig.rootDir)),
		);
	}

	/**
	 * Returns whether the file is a route source file.
	 */
	isRouteSourceFile(filePath: string): boolean {
		const resolvedPath = path.resolve(filePath);

		if (!isPathInside(resolvedPath, this.appConfig.absolutePaths.pagesDir)) {
			return false;
		}

		if (this.appConfig.templatesExt.some((extension) => resolvedPath.endsWith(extension))) {
			return true;
		}

		return /\.(?:[cm]?ts|[jt]sx?|mdx)$/u.test(resolvedPath);
	}

	/**
	 * Returns whether the file is an include/template source file.
	 */
	isIncludeSourceFile(filePath: string): boolean {
		const resolvedPath = path.resolve(filePath);

		if (!isPathInside(resolvedPath, this.appConfig.absolutePaths.includesDir)) {
			return false;
		}

		if (this.appConfig.templatesExt.some((extension) => resolvedPath.endsWith(extension))) {
			return true;
		}

		return /\.(?:[cm]?ts|[jt]sx?|mdx)$/u.test(resolvedPath);
	}

	/**
	 * Returns whether the file is an explicit server-rendered view module.
	 *
	 * @remarks
	 * These modules are typically registered through `renderServerModule` in
	 * `app.ts` rather than the filesystem router. They need a full browser reload
	 * because their HTML is produced on the server, not through client HMR entrypoints.
	 */
	isExplicitServerViewFile(filePath: string): boolean {
		const resolvedPath = path.resolve(filePath);
		const viewsDir = path.join(this.appConfig.absolutePaths.srcDir, 'views');

		if (!isPathInside(resolvedPath, viewsDir)) {
			return false;
		}

		if (this.appConfig.templatesExt.some((extension) => resolvedPath.endsWith(extension))) {
			return true;
		}

		return /\.(?:[cm]?ts|[jt]sx?|mdx)$/u.test(resolvedPath);
	}

	/**
	 * Returns whether the file is a server-executed source module outside the
	 * special route/include buckets.
	 */
	isServerModuleSourceFile(filePath: string): boolean {
		const resolvedPath = path.resolve(filePath);
		if (!isPathInside(resolvedPath, this.appConfig.absolutePaths.srcDir)) {
			return false;
		}

		if (this.appConfig.templatesExt.some((extension) => resolvedPath.endsWith(extension))) {
			return true;
		}

		return /\.(?:[cm]?ts|[jt]sx?|mdx)$/u.test(resolvedPath);
	}

	/**
	 * Returns whether a processor owns the changed file as an asset input.
	 *
	 * @remarks
	 * Watch config drives processor notifications only. Asset ownership requires
	 * declared capabilities so dependency-only watches (for example content
	 * collection MDX scans) do not skip server invalidation and HMR.
	 */
	isProcessorOwnedAsset(filePath: string): boolean {
		for (const processor of this.appConfig.processors.values()) {
			const capabilities = processor.getAssetCapabilities?.() ?? [];
			if (capabilities.length === 0) {
				continue;
			}

			const matchesConfiguredAsset =
				typeof processor.matchesFileFilter !== 'function' || processor.matchesFileFilter(filePath);

			if (
				matchesConfiguredAsset &&
				capabilities.some((capability) => processor.canProcessAsset?.(capability.kind, filePath))
			) {
				return true;
			}
		}

		return false;
	}
}

function shouldClearAllPageHtmlCache(category: DevelopmentInvalidationPlan['category']): boolean {
	return category === 'additional-watch';
}
