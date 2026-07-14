import type { AnyIntegrationPlugin } from '../../../plugins/integration-plugin.ts';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';

/** Resolves the integration plugin that owns one asset-processing batch key. */
export function resolveIntegrationPluginForProcessingKey(
	appConfig: EcoPagesAppConfig,
	processingKey: string,
): AnyIntegrationPlugin | undefined {
	if (!appConfig.integrations?.length) {
		return undefined;
	}

	const exactMatch = appConfig.integrations.find((integration) => integration.name === processingKey);
	if (exactMatch) {
		return exactMatch;
	}

	const baseName = processingKey.split(':')[0];
	if (!baseName || baseName === processingKey) {
		return undefined;
	}

	return appConfig.integrations.find((integration) => integration.name === baseName);
}
