import path from 'node:path';
import type { EcoComponent, EcoComponentConfig, ResolvedLazyTrigger } from '../../types/public-types.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
} from '../../services/assets/asset-processing-service/index.ts';
import { rapidhash } from '../../utils/hash.ts';
import { isProductionRuntime } from '../../utils/runtime.ts';
import { AssetFactory } from '../../services/assets/asset-processing-service/index.ts';
import { buildResolvedLazyTriggers, type ResolvedLazyGroup } from './lazy-trigger-planning.ts';
import { collectComponentDependencies } from './component-dependency-collection.ts';
import { packagePageDependencies } from './page-dependency-bundling.ts';
import type { LazyGroup } from './lazy-entry-collection.ts';

export const DEPENDENCY_ERRORS = {
	INVALID_STYLESHEET_ENTRY: 'Invalid stylesheet dependency entry: expected src or content',
	INVALID_SCRIPT_ENTRY: 'Invalid script dependency entry: expected src or content',
	LAZY_SCRIPT_MISSING_SRC: 'Lazy script dependency entry in dependencies.scripts requires a src value',
} as const;

function resolveLazyScripts(appConfig: EcoPagesAppConfig, componentDir: string, scripts: string[]): string {
	const getSafeFileName = (filepath: string): string => {
		const EXTENSIONS_TO_JS = ['ts', 'tsx'];
		const safe = filepath.replace(new RegExp(`\\.(${EXTENSIONS_TO_JS.join('|')})$`), '.js');
		return safe.startsWith('./') ? safe.slice(2) : safe;
	};

	const baseDir = componentDir.split(appConfig.srcDir)[1] ?? '';
	const resolvedPaths = scripts.map((script) => {
		const relativePath = [AssetFactory.RESOLVED_ASSETS_DIR, baseDir, getSafeFileName(script)]
			.filter(Boolean)
			.join('/')
			.replace(/\/+/g, '/');

		return `/${relativePath.replace(/^\/+/, '')}`;
	});

	return resolvedPaths.join(',');
}

const pendingLazyGroupsByConfig = new WeakMap<NonNullable<EcoComponent['config']>, Map<string, LazyGroup>>();
const MAX_PROCESSED_DEPENDENCY_CACHE_ENTRIES = 128;

function copyProcessedAssets(assets: ProcessedAsset[]): ProcessedAsset[] {
	return assets.map((asset) => {
		const copy: ProcessedAsset = { ...asset };
		if (asset.attributes) {
			copy.attributes = { ...asset.attributes };
		}
		if (asset.groupedBundle) {
			copy.groupedBundle = { ...asset.groupedBundle };
		}
		if (asset.bundledSourceFilepaths) {
			copy.bundledSourceFilepaths = [...asset.bundledSourceFilepaths];
		}
		return copy;
	});
}

function isLazyClientScript(dep: AssetDefinition): boolean {
	return dep.kind === 'script' && Boolean(dep.attributes?.['data-eco-lazy-key']);
}

function createEcopagesJsxLazyEntryName(integrationName: string, key: string): string {
	return `ecopages-${integrationName}-lazy-${rapidhash(key).toString(16)}`;
}

export class DependencyResolverService {
	private appConfig: EcoPagesAppConfig;
	private assetProcessingService: AssetProcessingService;
	private readonly shouldCacheProcessedDependencies: () => boolean;
	private readonly processedDependenciesCache = new Map<string, Promise<ProcessedAsset[]>>();
	private readonly componentCacheIds = new WeakMap<object, number>();
	private nextComponentCacheId = 0;

	/**
	 * Creates the dependency resolver used by route and component rendering.
	 *
	 * @remarks
	 * The resolver stays intentionally separate from HTML rendering so component
	 * dependency collection, lazy trigger grouping, and processed-asset generation
	 * can evolve without changing renderer implementations.
	 */
	constructor(
		appConfig: EcoPagesAppConfig,
		assetProcessingService: AssetProcessingService,
		shouldCacheProcessedDependencies: () => boolean = isProductionRuntime,
	) {
		this.appConfig = appConfig;
		this.assetProcessingService = assetProcessingService;
		this.shouldCacheProcessedDependencies = shouldCacheProcessedDependencies;
	}

	/**
	 * Resolves one dependency path relative to the component that declared it.
	 */
	resolveDependencyPath(componentDir: string, pathUrl: string): string {
		return path.join(componentDir, pathUrl);
	}

	/**
	 * Maps lazy script source entries to deterministic fallback public URLs
	 * used when bundling output URLs are unavailable.
	 */
	resolveLazyScripts(componentDir: string, scripts: string[]): string {
		return resolveLazyScripts(this.appConfig, componentDir, scripts);
	}

	/**
	 * Collects and processes component dependencies (styles, scripts, modules).
	 *
	 * @remarks
	 * Lazy client entries are held on the component config so the page client
	 * build can emit them in the same grouped Rolldown graph as islands.
	 * Route preparation may already have resolved trigger ids; those stay on
	 * the config so later SSR can stamp `data-eco-trigger` onto serialized HTML.
	 */
	async processComponentDependencies(
		components: Array<EcoComponent | Partial<EcoComponent> | undefined | null>,
		integrationName: string,
	): Promise<ProcessedAsset[]> {
		return this.processPreparedDependencies(components, integrationName, false);
	}

	/**
	 * Processes dependencies from a component list that already came from a prepared graph walk.
	 */
	async processPreparedComponentDependencies(
		components: Array<EcoComponent | Partial<EcoComponent> | undefined | null>,
		integrationName: string,
	): Promise<ProcessedAsset[]> {
		return this.processPreparedDependencies(components, integrationName, true);
	}

	private async processPreparedDependencies(
		components: Array<EcoComponent | Partial<EcoComponent> | undefined | null>,
		integrationName: string,
		skipNestedComponents: boolean,
	): Promise<ProcessedAsset[]> {
		const { dependencies, lazyScriptsByConfig } = this.collectDependencies(
			components,
			integrationName,
			false,
			skipNestedComponents,
		);

		const bundlesPageDependencies =
			this.appConfig.integrations?.find((integration) => integration.name === integrationName)
				?.bundlesPageDependencies ?? false;
		const packagedDependencies = packagePageDependencies(dependencies, integrationName, bundlesPageDependencies);
		const lazyDeps = packagedDependencies.filter(isLazyClientScript);
		const eagerDeps = packagedDependencies.filter((dep) => !isLazyClientScript(dep));

		for (const [config, lazyGroupsMap] of lazyScriptsByConfig.entries()) {
			pendingLazyGroupsByConfig.set(config, lazyGroupsMap);
			const lazyKeys = new Set(
				[...lazyGroupsMap.values()].flatMap((group) => group.scripts.map((script) => script.lazyKey)),
			);
			config._pendingLazyClientAssets = lazyDeps.filter((dep) => {
				const lazyKey = dep.kind === 'script' ? dep.attributes?.['data-eco-lazy-key'] : undefined;
				return Boolean(lazyKey && lazyKeys.has(lazyKey));
			});
		}

		if (!this.shouldCacheProcessedDependencies()) {
			return this.assetProcessingService.processDependencies(eagerDeps, integrationName);
		}

		const cacheKey = this.getProcessedDependenciesCacheKey(
			components,
			integrationName,
			skipNestedComponents,
			bundlesPageDependencies,
		);
		if (!cacheKey) {
			return this.assetProcessingService.processDependencies(eagerDeps, integrationName);
		}

		let pending = this.processedDependenciesCache.get(cacheKey);
		if (pending) {
			this.processedDependenciesCache.delete(cacheKey);
			this.processedDependenciesCache.set(cacheKey, pending);
		} else {
			pending = this.assetProcessingService.processDependencies(eagerDeps, integrationName);
			this.processedDependenciesCache.set(cacheKey, pending);
			if (this.processedDependenciesCache.size > MAX_PROCESSED_DEPENDENCY_CACHE_ENTRIES) {
				const oldestKey = this.processedDependenciesCache.keys().next().value;
				if (oldestKey !== undefined) {
					this.processedDependenciesCache.delete(oldestKey);
				}
			}
		}

		try {
			return copyProcessedAssets(await pending);
		} catch (error) {
			if (this.processedDependenciesCache.get(cacheKey) === pending) {
				this.processedDependenciesCache.delete(cacheKey);
			}
			throw error;
		}
	}

	private getProcessedDependenciesCacheKey(
		components: Array<EcoComponent | Partial<EcoComponent> | undefined | null>,
		integrationName: string,
		skipNestedComponents: boolean,
		bundlesPageDependencies: boolean,
	): string | undefined {
		const componentIds: number[] = [];
		for (const component of components) {
			if (!component) {
				continue;
			}

			if (
				typeof (component as EcoComponent & { resolveDependencies?: unknown }).resolveDependencies ===
				'function'
			) {
				return undefined;
			}

			const cacheIdentity = component.config ?? component;
			let componentId = this.componentCacheIds.get(cacheIdentity);
			if (componentId === undefined) {
				componentId = ++this.nextComponentCacheId;
				this.componentCacheIds.set(cacheIdentity, componentId);
			}
			componentIds.push(componentId);
		}

		return JSON.stringify([integrationName, skipNestedComponents, bundlesPageDependencies, componentIds]);
	}

	/**
	 * Resolves pending lazy triggers from processed grouped-build URLs.
	 *
	 * @remarks
	 * The pending entries and groups of a config are a function of its declarations, and a config is
	 * shared by every render that includes the component. Resolving does not consume them: a render
	 * that finishes first must not take the entries away from an overlapping render that has already
	 * collected the same component but not yet planned its client assets.
	 */
	applyPendingLazyTriggers(
		processedAssets: ProcessedAsset[],
		configs: Iterable<EcoComponentConfig | undefined>,
	): ResolvedLazyTrigger[] {
		const lazyKeyToOutputUrl = new Map<string, string>();
		for (const dependency of processedAssets) {
			if (dependency.kind !== 'script' || !dependency.srcUrl) {
				continue;
			}
			const lazyKey = dependency.attributes?.['data-eco-lazy-key'];
			if (lazyKey) {
				lazyKeyToOutputUrl.set(lazyKey, dependency.srcUrl);
			}
		}

		const triggers: ResolvedLazyTrigger[] = [];
		for (const config of configs) {
			if (!config) {
				continue;
			}
			const lazyGroupsMap = pendingLazyGroupsByConfig.get(config);
			if (!lazyGroupsMap) {
				if (config._resolvedLazyTriggers?.length) {
					triggers.push(...config._resolvedLazyTriggers);
				}
				continue;
			}

			const rawGroups: ResolvedLazyGroup[] = [];
			for (const group of lazyGroupsMap.values()) {
				const resolvedUrls = group.scripts
					.map(({ lazyKey, fallbackUrl }) => lazyKeyToOutputUrl.get(lazyKey) ?? fallbackUrl)
					.filter((url): url is string => Boolean(url && url.length > 0));

				if (resolvedUrls.length === 0) {
					continue;
				}

				rawGroups.push({ lazy: group.lazy, scripts: Array.from(new Set(resolvedUrls)) });
			}

			config._resolvedLazyTriggers = buildResolvedLazyTriggers(config, rawGroups);
			if (config._resolvedLazyTriggers?.length) {
				triggers.push(...config._resolvedLazyTriggers);
			}
		}

		return triggers;
	}

	/**
	 * Collects the unprocessed asset declarations of `components`, excluding Foreign Children and their descendants.
	 */
	collectOwnComponentDependencies(
		components: Array<EcoComponent | Partial<EcoComponent> | undefined | null>,
		integrationName: string,
	): AssetDefinition[] {
		return this.collectDependencies(components, integrationName, true).dependencies;
	}

	private collectDependencies(
		components: Array<EcoComponent | Partial<EcoComponent> | undefined | null>,
		integrationName: string,
		excludeForeignChildren: boolean,
		skipNestedComponents = false,
	) {
		return collectComponentDependencies({
			components,
			integrationName,
			excludeForeignChildren,
			skipNestedComponents,
			resolveLazyScripts: (componentDir, scripts) => this.resolveLazyScripts(componentDir, scripts),
			createEcopagesJsxLazyEntryName,
			errors: {
				invalidStylesheetEntry: DEPENDENCY_ERRORS.INVALID_STYLESHEET_ENTRY,
				invalidScriptEntry: DEPENDENCY_ERRORS.INVALID_SCRIPT_ENTRY,
				lazyScriptMissingSrc: DEPENDENCY_ERRORS.LAZY_SCRIPT_MISSING_SRC,
			},
		});
	}
}
