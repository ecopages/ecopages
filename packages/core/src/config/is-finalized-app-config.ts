import type { EcoPagesAppConfig } from '../types/internal-types.ts';

/**
 * @remarks
 * Finalized configs use Maps for processors/loaders; user configs use arrays.
 */
export function isFinalizedEcoPagesAppConfig(value: unknown): value is EcoPagesAppConfig {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const config = value as EcoPagesAppConfig;
	return config.processors instanceof Map && Array.isArray(config.templatesExt);
}
