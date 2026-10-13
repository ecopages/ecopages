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
	| 'route-source'
	| 'processor-owned-asset'
	| 'source'
	| 'runtime-restart'
	| 'entry-watched-config'
	| 'other';

export type DevelopmentInvalidationPlanningContext = {
	workspacePackageRoots?: readonly string[];
	entryWatcherOwnsConfig?: boolean;
};

const sourceFileExtension = /\.(?:[cm]?ts|[jt]sx?|mdx)$/u;

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

type CategoryInvalidationPlan = Omit<DevelopmentInvalidationPlan, 'category'>;

const INVALIDATION_PLAN_BY_CATEGORY = {
	'runtime-restart': {
		invalidateServerModules: false,
		refreshRoutes: false,
		reloadBrowser: false,
		delegateToHmr: false,
		processorHandledAsset: false,
	},
	'entry-watched-config': {
		invalidateServerModules: false,
		refreshRoutes: false,
		reloadBrowser: false,
		delegateToHmr: false,
		processorHandledAsset: false,
	},
	'public-asset': {
		invalidateServerModules: false,
		refreshRoutes: false,
		reloadBrowser: true,
		delegateToHmr: false,
		processorHandledAsset: false,
	},
	'additional-watch': {
		invalidateServerModules: true,
		refreshRoutes: false,
		reloadBrowser: true,
		delegateToHmr: false,
		processorHandledAsset: false,
	},
	'processor-owned-asset': {
		invalidateServerModules: false,
		refreshRoutes: false,
		reloadBrowser: false,
		delegateToHmr: false,
		processorHandledAsset: true,
	},
	'route-source': {
		invalidateServerModules: true,
		refreshRoutes: true,
		reloadBrowser: false,
		delegateToHmr: true,
		processorHandledAsset: false,
	},
	source: {
		invalidateServerModules: true,
		refreshRoutes: false,
		reloadBrowser: false,
		delegateToHmr: true,
		processorHandledAsset: false,
	},
	other: {
		invalidateServerModules: false,
		refreshRoutes: false,
		reloadBrowser: false,
		delegateToHmr: true,
		processorHandledAsset: false,
	},
} satisfies Record<DevelopmentInvalidationCategory, CategoryInvalidationPlan>;

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
 * Ordinary changes mark caches dirty here. A runtime restart path is returned
 * without invalidating anything because the runtime owner will replace the app.
 * Rebuild happens on the next request that needs a result, not on the filesystem event.
 */
export interface AppliedDevFileChanges {
	files: AppliedDevFileChange[];
	invalidateServerModules: boolean;
	refreshRoutes: boolean;
	reloadBrowser: boolean;
	delegateToHmr: boolean;
	runtimeRestartPath?: string;
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
	async applyDevFileChanges(
		changes: DevFileChanges,
		context: DevelopmentInvalidationPlanningContext = {},
	): Promise<AppliedDevFileChanges> {
		const files = this.collectAppliedFiles(changes, context);
		const applied = this.summarizeAppliedFiles(files);
		if (!applied.runtimeRestartPath) {
			await this.markAppliedFilesDirty(files, applied);
		}
		return applied;
	}

	private collectAppliedFiles(
		changes: DevFileChanges,
		context: DevelopmentInvalidationPlanningContext,
	): AppliedDevFileChange[] {
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
			const plan = this.planFileChange(filePath, context);
			if (plan.category === 'entry-watched-config') {
				continue;
			}
			files.push({ filePath, kind, plan });
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

		const runtimeRestartPath = files.find((file) => file.plan.category === 'runtime-restart')?.filePath;
		return {
			files,
			invalidateServerModules,
			refreshRoutes,
			reloadBrowser,
			delegateToHmr,
			...(runtimeRestartPath ? { runtimeRestartPath } : {}),
		};
	}

	private async markAppliedFilesDirty(files: AppliedDevFileChange[], applied: AppliedDevFileChanges): Promise<void> {
		getAppBuildInputIndex(this.appConfig).recordChanges(files.map((file) => file.filePath));
		if (applied.invalidateServerModules) {
			this.invalidateServerModules(
				files.filter((file) => file.plan.invalidateServerModules).map((file) => file.filePath),
			);
		}

		await this.invalidatePageHtmlCache(files);
		this.invalidatePageBrowserGraphs(files);
	}

	/**
	 * @remarks
	 * An `additionalWatchPaths` file can be read by any page without recording it, so a match clears
	 * every cached document. Every other edit evicts only the entries that recorded the path.
	 */
	private async invalidatePageHtmlCache(files: AppliedDevFileChange[]): Promise<void> {
		if (files.some((file) => file.plan.category === 'additional-watch')) {
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
				getAppBuildInputIndex(this.appConfig).unregister({
					consumer: 'server-route-module',
					key: path.resolve(file.filePath),
				});
			}
		}
	}

	/**
	 * Classifies one changed file into an explicit framework invalidation plan.
	 */
	planFileChange(
		filePath: string,
		context: DevelopmentInvalidationPlanningContext = {},
	): DevelopmentInvalidationPlan {
		const category = this.classifyFileChange(filePath, context);
		return { category, ...INVALIDATION_PLAN_BY_CATEGORY[category] };
	}

	private classifyFileChange(
		filePath: string,
		context: DevelopmentInvalidationPlanningContext,
	): DevelopmentInvalidationCategory {
		if (context.entryWatcherOwnsConfig && this.isConfigModuleFile(filePath)) {
			return 'entry-watched-config';
		}

		if (
			context.workspacePackageRoots?.some((root) => isPathInside(filePath, root)) ||
			this.isRuntimeRestartFile(filePath)
		) {
			return 'runtime-restart';
		}

		if (this.isPublicDirFile(filePath)) {
			return 'public-asset';
		}

		if (this.matchesAdditionalWatchPaths(filePath)) {
			return 'additional-watch';
		}

		if (this.isProcessorOwnedAsset(filePath)) {
			return 'processor-owned-asset';
		}

		if (this.isRouteSourceFile(filePath)) {
			return 'route-source';
		}

		if (getAppBuildInputIndex(this.appConfig).hasSourcePath(filePath) || this.isServerModuleSourceFile(filePath)) {
			return 'source';
		}

		return 'other';
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

	/** Returns whether a file is an include or template source. */
	isIncludeSourceFile(filePath: string): boolean {
		const resolvedPath = path.resolve(filePath);
		return isPathInside(resolvedPath, this.appConfig.absolutePaths.includesDir) && this.isSourceFile(resolvedPath);
	}

	/** Returns whether a file is an explicit server-rendered view module. */
	isExplicitServerViewFile(filePath: string): boolean {
		const resolvedPath = path.resolve(filePath);
		const viewsDir = path.join(this.appConfig.absolutePaths.srcDir, 'views');
		return isPathInside(resolvedPath, viewsDir) && this.isSourceFile(resolvedPath);
	}

	/**
	 * Returns whether the file is a route source file.
	 */
	isRouteSourceFile(filePath: string): boolean {
		const resolvedPath = path.resolve(filePath);
		return isPathInside(resolvedPath, this.appConfig.absolutePaths.pagesDir) && this.isSourceFile(resolvedPath);
	}

	/**
	 * Returns whether the file is source-like under a server-owned source root.
	 */
	isServerModuleSourceFile(filePath: string): boolean {
		const resolvedPath = path.resolve(filePath);
		const sourceRoots = [
			this.appConfig.absolutePaths.srcDir,
			this.appConfig.absolutePaths.includesDir,
			path.join(this.appConfig.absolutePaths.srcDir, 'views'),
		];
		return sourceRoots.some((root) => isPathInside(resolvedPath, root)) && this.isSourceFile(resolvedPath);
	}

	private isSourceFile(filePath: string): boolean {
		return (
			this.appConfig.templatesExt.some((extension) => filePath.endsWith(extension)) ||
			sourceFileExtension.test(filePath)
		);
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
