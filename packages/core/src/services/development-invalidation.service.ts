import path from 'node:path';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import { getAppDevGraphService } from './dev-graph.service.ts';

export type DevelopmentInvalidationCategory =
	| 'public-asset'
	| 'additional-watch'
	| 'include-source'
	| 'route-source'
	| 'processor-owned-asset'
	| 'server-source'
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
 * Framework-owned development invalidation service.
 *
 * @remarks
 * This service centralizes two responsibilities:
 * - file-change classification for watcher behavior
 * - app-owned server-module invalidation versioning backed by the dev graph
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
	 * Returns the current app-owned server-module invalidation version.
	 */
	getServerModuleInvalidationVersion(): number {
		return getAppDevGraphService(this.appConfig).getServerInvalidationVersion();
	}

	/**
	 * Invalidates the app-owned server-module graph.
	 */
	invalidateServerModules(changedFiles?: string[]): void {
		getAppDevGraphService(this.appConfig).invalidateServerModules(changedFiles);
	}

	/**
	 * Resets runtime-owned graph state and invalidates server modules.
	 */
	resetRuntimeState(changedFiles?: string[]): void {
		const devGraphService = getAppDevGraphService(this.appConfig);
		devGraphService.invalidateServerModules(changedFiles);
		devGraphService.reset();
	}

	/**
	 * Classifies one changed file into an explicit framework invalidation plan.
	 */
	planFileChange(filePath: string): DevelopmentInvalidationPlan {
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
				invalidateServerModules: false,
				refreshRoutes: false,
				reloadBrowser: true,
				delegateToHmr: false,
				processorHandledAsset: false,
			};
		}

		if (this.isIncludeSourceFile(filePath)) {
			return {
				category: 'include-source',
				invalidateServerModules: true,
				refreshRoutes: false,
				reloadBrowser: true,
				delegateToHmr: false,
				processorHandledAsset: false,
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
	 * Returns whether the file lives under the public directory.
	 */
	isPublicDirFile(filePath: string): boolean {
		return path.resolve(filePath).startsWith(this.appConfig.absolutePaths.publicDir);
	}

	/**
	 * Returns whether the file matches `additionalWatchPaths`.
	 */
	matchesAdditionalWatchPaths(filePath: string): boolean {
		const normalizedPath = path.resolve(filePath);
		const patterns = this.appConfig.additionalWatchPaths;
		if (!patterns.length) return false;

		for (const pattern of patterns) {
			if (pattern.includes('*')) {
				const ext = pattern.replace(/\*\*?\/\*/, '');
				if (normalizedPath.endsWith(ext)) return true;
			} else if (normalizedPath.endsWith(pattern) || normalizedPath === path.resolve(pattern)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Returns whether the file is a route source file.
	 */
	isRouteSourceFile(filePath: string): boolean {
		const resolvedPath = path.resolve(filePath);

		if (!resolvedPath.startsWith(this.appConfig.absolutePaths.pagesDir)) {
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

		if (!resolvedPath.startsWith(this.appConfig.absolutePaths.includesDir)) {
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
		if (!resolvedPath.startsWith(this.appConfig.absolutePaths.srcDir)) {
			return false;
		}

		if (this.appConfig.templatesExt.some((extension) => resolvedPath.endsWith(extension))) {
			return true;
		}

		return /\.(?:[cm]?ts|[jt]sx?|mdx)$/u.test(resolvedPath);
	}

	/**
	 * Returns whether a processor owns the changed file as an asset input.
	 */
	isProcessorOwnedAsset(filePath: string): boolean {
		for (const processor of this.appConfig.processors.values()) {
			const capabilities = processor.getAssetCapabilities?.() ?? [];
			if (capabilities.length > 0) {
				const matchesConfiguredAsset =
					typeof processor.matchesFileFilter !== 'function' || processor.matchesFileFilter(filePath);

				if (
					matchesConfiguredAsset &&
					capabilities.some((capability) => processor.canProcessAsset?.(capability.kind, filePath))
				) {
					return true;
				}

				continue;
			}

			const watchConfig = processor.getWatchConfig();
			if (!watchConfig) continue;

			const { extensions = [] } = watchConfig;
			if (extensions.length && extensions.some((ext) => filePath.endsWith(ext))) {
				return true;
			}
		}

		return false;
	}
}
