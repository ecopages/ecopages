import type { EcoPagesAppConfig } from '../../../config/internal-types.ts';
import type { ProcessedAsset } from '../../../assets/asset-processing-service/index.ts';
import { path } from '@ecopages/file-system/path';
import { resolveDiscoveredWatchFiles, resolveInferredStylesheets } from '../../../eco/discovered-dependency-paths.ts';
import type { PreparedComponentGraphNode } from './component-graph.ts';
import { ECO_GLOBAL_SCRIPT_ATTRIBUTE } from '../../../client/navigation-attributes.ts';

function markGlobalScript(asset: ProcessedAsset): ProcessedAsset {
	return asset.kind === 'script'
		? { ...asset, attributes: { ...asset.attributes, [ECO_GLOBAL_SCRIPT_ATTRIBUTE]: '' } }
		: asset;
}

/**
 * Lists the global scripts of every Integration a Page uses, in config order.
 *
 * @remarks
 * Every Integration's scripts come from the same place, `getResolvedIntegrationDependencies()`, so the order and the
 * content are the same whichever Integration owns the Page. The owner always takes part; the other names come from
 * the Page client plan, so the component graph is not walked a second time.
 *
 * Each script carries `data-eco-global-script`, which is how a client navigation tells them from Component scripts.
 */
export function collectPageIntegrationDependencies(
	appConfig: EcoPagesAppConfig,
	integrationNames: Iterable<string>,
	ownerName: string,
): ProcessedAsset[] {
	const usedNames = new Set(integrationNames);
	usedNames.add(ownerName);
	return appConfig.integrations.flatMap((integration) =>
		usedNames.has(integration.name) && typeof integration.getResolvedIntegrationDependencies === 'function'
			? integration.getResolvedIntegrationDependencies().map(markGlobalScript)
			: [],
	);
}

/**
 * Collects file dependencies from prepared nodes without traversing component configs again.
 */
export function collectComponentGraphWatchPaths(
	nodes: ReadonlyArray<PreparedComponentGraphNode>,
	rootDir: string,
	additionalPaths: ReadonlyArray<string> = [],
): string[] {
	const paths = new Set(additionalPaths.map((file) => path.resolve(rootDir, file)));
	for (const node of nodes) {
		if (!node.componentFile || !node.component.config) {
			continue;
		}

		const componentFile = path.resolve(rootDir, node.componentFile);
		paths.add(componentFile);
		for (const style of node.ownAssets.stylesheets ?? []) {
			const src = typeof style === 'string' ? style : style.src;
			if (src) {
				paths.add(path.resolve(path.dirname(componentFile), src));
			}
		}
		for (const file of resolveInferredStylesheets(node.component.config, rootDir)) {
			paths.add(file);
		}
		for (const watchFile of resolveDiscoveredWatchFiles(node.component.config, rootDir)) {
			paths.add(watchFile);
		}
	}

	return [...paths];
}
