import { rapidhash } from '../../../utils/hash.ts';
import type { AssetDefinition, ContentScriptAsset, ProcessedAsset } from './assets.types.ts';

/** Shared grouped-build id prefix for page-owned content scripts. */
export const PAGE_OWNED_CONTENT_SCRIPT_BUNDLE_PREFIX = 'ecopages';

/** Returns the stable grouped-build id for one integration's page-owned content scripts. */
export function createPageOwnedContentScriptBundleId(integrationName: string): string {
	return `${PAGE_OWNED_CONTENT_SCRIPT_BUNDLE_PREFIX}-${integrationName}-page-content-scripts`;
}

/** Returns whether page-owned content scripts should share one grouped build for this integration. */
export function shouldAssignPageOwnedContentScriptGroups(integrationName: string): boolean {
	return integrationName === 'ecopages-jsx';
}

function isPageOwnedGroupableContentScript(dep: AssetDefinition): dep is ContentScriptAsset {
	if (dep.kind !== 'script' || dep.source !== 'content' || dep.inline) {
		return false;
	}

	if (dep.groupedBundle?.id) {
		return false;
	}

	if (dep.packageRole === 'keep-separate' || dep.packageRole === 'runtime' || dep.packageRole === 'dynamic-chunk') {
		return false;
	}

	return true;
}

function createPageOwnedGroupedEntryName(dep: ContentScriptAsset, usedEntryNames: Set<string>): string {
	const baseName = dep.name ?? `script-${rapidhash(dep.content).toString(16)}`;
	if (!usedEntryNames.has(baseName)) {
		usedEntryNames.add(baseName);
		return baseName;
	}

	let suffix = 2;
	let candidate = `${baseName}-${suffix}`;
	while (usedEntryNames.has(candidate)) {
		suffix += 1;
		candidate = `${baseName}-${suffix}`;
	}

	usedEntryNames.add(candidate);
	return candidate;
}

/**
 * Tags page-owned content scripts in one dependency batch with a shared grouped-build id.
 *
 * @remarks
 * Lazy component file scripts and integration runtime assets stay ungrouped. Integrations
 * that already assign a grouped id (for example React Router pages) are left unchanged.
 */
export function assignPageOwnedContentScriptGroupedBundles(
	dependencies: AssetDefinition[],
	integrationName: string,
): void {
	if (!shouldAssignPageOwnedContentScriptGroups(integrationName)) {
		return;
	}

	const bundleId = createPageOwnedContentScriptBundleId(integrationName);
	const usedEntryNames = new Set<string>();

	for (const dependency of dependencies) {
		if (!isPageOwnedGroupableContentScript(dependency)) {
			continue;
		}

		dependency.groupedBundle = {
			id: bundleId,
			entryName: createPageOwnedGroupedEntryName(dependency, usedEntryNames),
		};
	}
}

/** Forces grouped content scripts to run through the bundler even in development. */
export function ensureGroupedContentScriptsBundle(dependencies: AssetDefinition[]): void {
	for (const dependency of dependencies) {
		if (dependency.kind !== 'script' || dependency.source !== 'content' || !dependency.groupedBundle?.id) {
			continue;
		}

		if (dependency.bundle === false) {
			dependency.bundle = true;
		}
	}
}

const KNOWN_GROUPING_INTEGRATIONS = new Set(['react', 'ecopages-jsx', 'lit', 'mdx', 'kitajs']);

/** Resolves the integration name used for page-owned grouped content-script assignment. */
export function resolveGroupingIntegrationName(processingKey: string): string | undefined {
	if (KNOWN_GROUPING_INTEGRATIONS.has(processingKey)) {
		return processingKey;
	}

	const prefix = processingKey.split(':')[0];
	if (prefix && KNOWN_GROUPING_INTEGRATIONS.has(prefix)) {
		return prefix;
	}

	if (processingKey.startsWith('ecopages-react-')) {
		return 'react';
	}

	if (processingKey.startsWith('ecopages-jsx-')) {
		return 'ecopages-jsx';
	}

	return undefined;
}

/**
 * Splits grouped content-script dependencies from ordinary dependencies so callers can
 * route them through `processGrouped` without changing ordering for the remaining assets.
 */
export function partitionGroupedContentScriptDependencies(typeDeps: AssetDefinition[]): {
	groupedBundleDeps: Map<string, AssetDefinition[]>;
	ungroupedDeps: AssetDefinition[];
} {
	const groupedBundleDeps = new Map<string, AssetDefinition[]>();
	const ungroupedDeps: AssetDefinition[] = [];

	for (const dep of typeDeps) {
		if (dep.kind === 'script' && dep.source === 'content' && dep.groupedBundle?.id) {
			const existing = groupedBundleDeps.get(dep.groupedBundle.id) ?? [];
			existing.push(dep);
			groupedBundleDeps.set(dep.groupedBundle.id, existing);
			continue;
		}

		ungroupedDeps.push(dep);
	}

	return {
		groupedBundleDeps,
		ungroupedDeps,
	};
}

type GroupedBundleProcessor = {
	processGrouped?: (deps: AssetDefinition[]) => Promise<ProcessedAsset[]>;
};

type ProcessGroupedDependencyBundlesOptions = {
	bundles: AssetDefinition[][];
	key: string;
	getCachedAsset: (dep: AssetDefinition, depKey: string) => ProcessedAsset | null;
	getDependencyKey: (dep: AssetDefinition) => string;
	getGroupedProcessor: () => GroupedBundleProcessor | undefined;
	resolveProcessedAssetSrcUrl: (processed: ProcessedAsset) => string | undefined;
	setCachedAsset: (dep: AssetDefinition, depKey: string, processed: ProcessedAsset) => void;
	logError: (error: unknown) => void;
};

/**
 * Processes grouped content-script bundles while preserving per-entry cache keys.
 *
 * When every dependency in a bundle already has a cached processed asset, the cached
 * entries are returned directly and the grouped processor is skipped.
 */
export async function processGroupedDependencyBundles(
	options: ProcessGroupedDependencyBundlesOptions,
): Promise<ProcessedAsset[]> {
	const {
		bundles,
		key,
		getCachedAsset,
		getDependencyKey,
		getGroupedProcessor,
		resolveProcessedAssetSrcUrl,
		setCachedAsset,
		logError,
	} = options;

	const groupedPromises = bundles.map(async (bundleDeps) => {
		const cachedResults = bundleDeps.map((dep) => {
			const cached = getCachedAsset(dep, getDependencyKey(dep));
			return cached ? ({ key, ...cached } as ProcessedAsset) : null;
		});

		if (cachedResults.every((result) => result !== null)) {
			return cachedResults.filter((result): result is ProcessedAsset => result !== null);
		}

		const processor = getGroupedProcessor();
		if (!processor?.processGrouped) {
			return [];
		}

		try {
			const processedResults = await processor.processGrouped(bundleDeps);

			return processedResults.map((processed, index) => {
				const dep = bundleDeps[index]!;
				const depKey = getDependencyKey(dep);
				const srcUrl = resolveProcessedAssetSrcUrl(processed);
				const processedWithKey = {
					key,
					...processed,
					srcUrl,
				};

				setCachedAsset(dep, depKey, processedWithKey);
				return processedWithKey as ProcessedAsset;
			});
		} catch (error) {
			logError(error);
			return [];
		}
	});

	return (await Promise.all(groupedPromises)).flat();
}
