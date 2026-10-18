import type { AssetDefinition } from './assets.types.ts';

/** Integration-owned shaping of one asset batch before processor dispatch. */
export interface AssetProcessingIntegration {
	readonly name: string;
	prepareAssetDependencies?(dependencies: AssetDefinition[]): AssetDefinition[];
}

export function resolveAssetProcessingIntegration(
	name: string,
	currentIntegration: AssetProcessingIntegration | undefined,
	integrations: readonly AssetProcessingIntegration[] | undefined,
): AssetProcessingIntegration | undefined {
	if (currentIntegration?.name === name) {
		return currentIntegration;
	}

	return integrations?.find((integration) => integration.name === name);
}
