import path from 'node:path';
import type { EcoComponent } from '../../types/public-types.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type {
	AssetProcessingService,
	ProcessedAsset,
} from '../../services/assets/asset-processing-service/index.ts';
import { rapidhash } from '../../utils/hash.ts';
import { AssetFactory } from '../../services/assets/asset-processing-service/index.ts';
import {
	buildResolvedLazyTriggers,
	type ResolvedLazyGroup,
} from './lazy-trigger-planning.ts';
import { collectComponentDependencies } from './component-dependency-collection.ts';
import { createUnifiedPageDependencies } from './page-dependency-bundling.ts';

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

const ECOPAGES_JSX_INTEGRATION_NAME = 'ecopages-jsx';

function isEcopagesJsxIntegration(integrationName: string): boolean {
	return integrationName === ECOPAGES_JSX_INTEGRATION_NAME;
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
	 * Collects and processes component dependencies (styles, scripts, modules, lazy scripts).
	 * Lazy dependencies are always resolved into global-injector trigger maps.
	 */
	async processComponentDependencies(
		components: Array<EcoComponent | Partial<EcoComponent> | undefined | null>,
		integrationName: string,
	): Promise<ProcessedAsset[]> {
		if (!this.assetProcessingService?.processDependencies) return [];
		const { dependencies, lazyScriptsByConfig } = collectComponentDependencies({
			components,
			integrationName,
			resolveLazyScripts: (componentDir, scripts) => this.resolveLazyScripts(componentDir, scripts),
			createEcopagesJsxLazyEntryName,
			isEcopagesJsxIntegration,
			errors: {
				invalidStylesheetEntry: DEPENDENCY_ERRORS.INVALID_STYLESHEET_ENTRY,
				invalidScriptEntry: DEPENDENCY_ERRORS.INVALID_SCRIPT_ENTRY,
				lazyScriptMissingSrc: DEPENDENCY_ERRORS.LAZY_SCRIPT_MISSING_SRC,
			},
		});

		const unifiedDependencies = createUnifiedPageDependencies(dependencies, integrationName);
		const hasLazyDependencies = unifiedDependencies.some(
			(dep) => dep.kind === 'script' && dep.excludeFromHtml === true,
		);

		const processedDependencies = await this.assetProcessingService.processDependencies(
			unifiedDependencies,
			integrationName,
		);
		const lazyKeyToOutputUrl = new Map<string, string>();

		for (const dependency of processedDependencies) {
			if (dependency.kind === 'script' && dependency.srcUrl) {
				const lazyKey = dependency.attributes?.['data-eco-lazy-key'];
				if (lazyKey) {
					lazyKeyToOutputUrl.set(lazyKey, dependency.srcUrl);
				}
			}
		}

		for (const [config, lazyGroupsMap] of lazyScriptsByConfig.entries()) {
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

			if (hasLazyDependencies) {
				config._resolvedLazyTriggers = buildResolvedLazyTriggers(config, rawGroups);
				config._resolvedLazyScripts = undefined;
			}
		}

		return processedDependencies;
	}
}
