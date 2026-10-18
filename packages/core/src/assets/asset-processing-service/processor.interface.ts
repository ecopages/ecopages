import type { AssetDefinition, ProcessedAsset } from './assets.types.ts';

/**
 * Base interface for asset processors.
 * Processors transform asset definitions into processed assets.
 */
export interface AssetProcessor<T extends AssetDefinition = AssetDefinition> {
	process(asset: T): Promise<ProcessedAsset>;
}
