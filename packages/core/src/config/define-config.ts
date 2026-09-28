import type { EcoPagesUserConfig } from './user-config-types.ts';

/**
 * Type helper for `eco.config.ts` authoring.
 *
 * @remarks
 * Synchronous identity only. Loading and finalization happen through
 * {@link loadEcoPagesConfig} or {@link createApp}.
 */
export function defineConfig(config: EcoPagesUserConfig): EcoPagesUserConfig {
	return config;
}
