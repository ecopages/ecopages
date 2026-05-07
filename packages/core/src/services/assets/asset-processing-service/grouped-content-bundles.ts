import type { AssetDefinition, ProcessedAsset } from './assets.types.ts';

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
