import type { IHmrManager } from '../../internal-types';
import type { AssetDefinition, ProcessedAsset } from './assets.types';

/**
 * Base interface for asset processors.
 * Processors transform asset definitions into processed assets.
 */
export interface AssetProcessor<T extends AssetDefinition = AssetDefinition> {
	process(asset: T): Promise<ProcessedAsset>;
}

/**
 * Interface for processors that support HMR (Hot Module Replacement).
 * These processors can receive an HMR manager to enable hot reloading capabilities.
 */
export interface HmrAwareProcessor extends AssetProcessor {
	setHmrManager(hmrManager: IHmrManager): void;
}

/**
 * Type guard to check if a processor supports HMR.
 * @param processor - The processor to check
 * @returns True if the processor implements HmrAwareProcessor
 */
export function isHmrAware(processor: AssetProcessor): processor is HmrAwareProcessor {
	return 'setHmrManager' in processor && typeof (processor as HmrAwareProcessor).setHmrManager === 'function';
}
