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
 * The owner always takes part, and its scripts come from `owner.dependencies`, the owning renderer's render
 * session.
 * The other names come from the Page client plan, so the component graph is not walked a second time. The order is
 * the same whichever Integration owns the Page.
 *
 * Each script carries `data-eco-global-script`, which is how a client navigation tells them from Component scripts.
 */
export function collectPageIntegrationDependencies(
	appConfig: EcoPagesAppConfig,
	integrationNames: Iterable<string>,
	owner: { name: string; dependencies: ProcessedAsset[] },
): ProcessedAsset[] {
	const usedNames = new Set(integrationNames);
	return appConfig.integrations.flatMap((integration) => {
		if (integration.name === owner.name) {
			return owner.dependencies.map(markGlobalScript);
		}

		if (!usedNames.has(integration.name) || typeof integration.getResolvedIntegrationDependencies !== 'function') {
			return [];
		}

		return integration.getResolvedIntegrationDependencies().map(markGlobalScript);
	});
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
