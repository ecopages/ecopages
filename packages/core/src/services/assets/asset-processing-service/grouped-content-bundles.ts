import type { AssetDefinition, ProcessedAsset } from './assets.types.ts';
import { isDevelopmentRuntime } from '../../../utils/runtime.ts';
import { finalizeProcessedAsset } from './finalize-processed-asset.ts';

function getGroupedBundleAssetKey(groupedBundle: { id: string; entryName: string }): string {
	return `${groupedBundle.id}:${groupedBundle.entryName}`;
}

function isGroupedScriptDependency(dep: AssetDefinition): dep is AssetDefinition & {
	kind: 'script';
	groupedBundle: { id: string; entryName: string };
} {
	return dep.kind === 'script' && Boolean(dep.groupedBundle?.id);
}

/** Forces grouped scripts to run through the bundler in production builds. */
export function ensureGroupedContentScriptsBundle(dependencies: AssetDefinition[]): void {
	if (isDevelopmentRuntime()) {
		return;
	}

	for (const dependency of dependencies) {
		if (!isGroupedScriptDependency(dependency)) {
			continue;
		}

		if (dependency.bundle === false) {
			dependency.bundle = true;
		}
	}
}

/**
 * Splits grouped script dependencies from ordinary dependencies so callers can
 * route them through `processGrouped` without changing ordering for the remaining assets.
 */
export function partitionGroupedContentScriptDependencies(typeDeps: AssetDefinition[]): {
	groupedBundleDeps: Map<string, AssetDefinition[]>;
	ungroupedDeps: AssetDefinition[];
} {
	const groupedBundleDeps = new Map<string, AssetDefinition[]>();
	const ungroupedDeps: AssetDefinition[] = [];

	for (const dep of typeDeps) {
		if (isGroupedScriptDependency(dep)) {
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
	getCachedBundle: (deps: AssetDefinition[], depKeys: string[]) => ProcessedAsset[] | null;
	getDependencyKey: (dep: AssetDefinition) => string;
	getGroupedProcessor: (deps: AssetDefinition[]) => GroupedBundleProcessor | undefined;
	resolveProcessedAssetSrcUrl: (processed: ProcessedAsset) => string | undefined;
	setCachedBundle: (deps: AssetDefinition[], depKeys: string[], processed: ProcessedAsset[]) => void;
	logError: (error: unknown) => void;
};

/**
 * Processes grouped script bundles while caching each complete group.
 *
 * @remarks
 * The cache owner must only return a bundle when its complete dependency set was built
 * together. Partial processor results are returned, but are not cached as a complete group.
 */
export async function processGroupedDependencyBundles(
	options: ProcessGroupedDependencyBundlesOptions,
): Promise<ProcessedAsset[]> {
	const {
		bundles,
		getCachedBundle,
		getDependencyKey,
		getGroupedProcessor,
		resolveProcessedAssetSrcUrl,
		setCachedBundle,
		logError,
	} = options;

	const groupedPromises = bundles.map(async (bundleDeps) => {
		const dependencyKeys = bundleDeps.map(getDependencyKey);
		const cachedBundle = getCachedBundle(bundleDeps, dependencyKeys);

		if (cachedBundle) {
			return cachedBundle.map((result) => finalizeProcessedAsset(result, resolveProcessedAssetSrcUrl));
		}

		const processor = getGroupedProcessor(bundleDeps);
		if (!processor?.processGrouped) {
			return [];
		}

		try {
			const processedResults = await processor.processGrouped(bundleDeps);
			const processedByEntryKey = new Map<string, ProcessedAsset>();

			for (const processed of processedResults) {
				if (!processed.groupedBundle) {
					continue;
				}

				processedByEntryKey.set(getGroupedBundleAssetKey(processed.groupedBundle), processed);
			}

			const processedBundle = bundleDeps.flatMap((dep) => {
				if (!isGroupedScriptDependency(dep)) {
					return [];
				}

				const processed = processedByEntryKey.get(getGroupedBundleAssetKey(dep.groupedBundle));
				if (!processed) {
					return [];
				}

				const finalized = finalizeProcessedAsset(processed, resolveProcessedAssetSrcUrl);

				return [finalized];
			});

			if (processedBundle.length === bundleDeps.length) {
				setCachedBundle(bundleDeps, dependencyKeys, processedBundle);
			}

			return processedBundle;
		} catch (error) {
			logError(error);
			return [];
		}
	});

	return (await Promise.all(groupedPromises)).flat();
}
