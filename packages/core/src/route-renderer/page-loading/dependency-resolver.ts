import path from 'node:path';
import type { EcoComponent, EcoComponentConfig, ResolvedLazyTrigger } from '../../types/public-types.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
} from '../../services/assets/asset-processing-service/index.ts';
import { rapidhash } from '../../utils/hash.ts';
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

function isLazyClientScript(dep: AssetDefinition): boolean {
	return dep.kind === 'script' && Boolean(dep.attributes?.['data-eco-lazy-key']);
}

function createEcopagesJsxLazyEntryName(integrationName: string, key: string): string {
	return `ecopages-${integrationName}-lazy-${rapidhash(key).toString(16)}`;
}

export class DependencyResolverService {
	private appConfig: EcoPagesAppConfig;
	private assetProcessingService: AssetProcessingService;

	/**
	 * Creates the dependency resolver used by route and component rendering.
	 *
	 * @remarks
	 * The resolver stays intentionally separate from HTML rendering so component
	 * dependency collection, lazy trigger grouping, and processed-asset generation
	 * can evolve without changing renderer implementations.
	 */
	constructor(appConfig: EcoPagesAppConfig, assetProcessingService: AssetProcessingService) {
		this.appConfig = appConfig;
		this.assetProcessingService = assetProcessingService;
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
		if (!this.assetProcessingService?.processDependencies) return [];
		const { dependencies, lazyScriptsByConfig } = this.collectDependencies(components, integrationName, false);

		const packagedDependencies = packagePageDependencies(dependencies, integrationName);
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
			config._resolvedLazyScripts = undefined;
		}

		return this.assetProcessingService.processDependencies(eagerDeps, integrationName);
	}

	/**
	 * Resolves pending lazy triggers from processed grouped-build URLs.
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
			config._resolvedLazyScripts = undefined;
			config._pendingLazyClientAssets = undefined;
			pendingLazyGroupsByConfig.delete(config);
			if (config._resolvedLazyTriggers?.length) {
				triggers.push(...config._resolvedLazyTriggers);
			}
		}

		return triggers;
	}

	/**
	 * Collects the unprocessed asset declarations of `components`, excluding Foreign Children and their descendants.
	 *
	 * @remarks Returns nothing when assets cannot be processed, matching `processComponentDependencies()`.
	 */
	collectOwnComponentDependencies(
		components: Array<EcoComponent | Partial<EcoComponent> | undefined | null>,
		integrationName: string,
	): AssetDefinition[] {
		if (!this.assetProcessingService?.processDependencies) return [];
		return this.collectDependencies(components, integrationName, true).dependencies;
	}

	private collectDependencies(
		components: Array<EcoComponent | Partial<EcoComponent> | undefined | null>,
		integrationName: string,
		excludeForeignChildren: boolean,
	) {
		return collectComponentDependencies({
			components,
			integrationName,
			excludeForeignChildren,
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
