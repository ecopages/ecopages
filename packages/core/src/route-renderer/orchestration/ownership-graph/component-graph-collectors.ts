import type { EcoPagesAppConfig } from '../../../config/internal-types.ts';
import type { ProcessedAsset } from '../../../assets/asset-processing-service/index.ts';
import path from 'node:path';
import { getDiscoveredWatchFiles, getInferredStylesheets } from '../../../eco/discovered-dependencies.ts';
import type { PreparedComponentGraphNode } from './component-graph.ts';

/**
 * Resolved runtime dependencies for integrations named on a page client plan.
 *
 * @remarks
 * The plan already lists those names. Callers pass the names instead of walking
 * the component graph a second time.
 */
export function collectUsedIntegrationDependenciesFromNames(
	appConfig: EcoPagesAppConfig,
	integrationNames: Iterable<string>,
	currentIntegrationName: string,
): ProcessedAsset[] {
	const dependencies: ProcessedAsset[] = [];

	for (const integrationName of integrationNames) {
		if (integrationName === currentIntegrationName) {
			continue;
		}

		const integrationPlugin = appConfig.integrations.find((integration) => integration.name === integrationName);
		if (!integrationPlugin || typeof integrationPlugin.getResolvedIntegrationDependencies !== 'function') {
			continue;
		}

		dependencies.push(...integrationPlugin.getResolvedIntegrationDependencies());
	}

	return dependencies;
}

/**
 * Collects file dependencies from prepared nodes without traversing component configs again.
 */
export function collectComponentGraphWatchPaths(
	nodes: ReadonlyArray<PreparedComponentGraphNode>,
	additionalPaths: ReadonlyArray<string> = [],
): string[] {
	const paths = new Set(additionalPaths.map((file) => path.resolve(file)));
	for (const node of nodes) {
		if (!node.componentFile || !node.component.config) {
			continue;
		}

		const componentFile = path.resolve(node.componentFile);
		paths.add(componentFile);
		for (const style of node.ownAssets.stylesheets ?? []) {
			const src = typeof style === 'string' ? style : style.src;
			if (src) {
				paths.add(path.resolve(path.dirname(componentFile), src));
			}
		}
		for (const src of getInferredStylesheets(node.component.config)) {
			paths.add(path.resolve(path.dirname(componentFile), src));
		}
		for (const watchFile of getDiscoveredWatchFiles(node.component.config)) {
			paths.add(path.resolve(watchFile));
		}
	}

	return [...paths];
}
