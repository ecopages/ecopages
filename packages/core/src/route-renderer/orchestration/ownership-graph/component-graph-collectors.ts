import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { ProcessedAsset } from '../../../services/assets/asset-processing-service/index.ts';

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
