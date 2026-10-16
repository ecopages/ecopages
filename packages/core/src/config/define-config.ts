import type { EcoPagesUserConfig, EcoPagesUserConfigFactory } from './user-config-types.ts';

/**
 * Type helper for `eco.config.ts` authoring.
 *
 * @remarks
 * Synchronous identity only. Loading and finalization happen through
 * {@link loadEcoPagesConfig} or {@link createApp}. Pass a factory to create fresh
 * integration, processor and loader instances when one config module creates multiple apps.
 */
export function defineConfig(config: EcoPagesUserConfig): EcoPagesUserConfig;
export function defineConfig(config: EcoPagesUserConfigFactory): EcoPagesUserConfigFactory;
export function defineConfig(
	config: EcoPagesUserConfig | EcoPagesUserConfigFactory,
): EcoPagesUserConfig | EcoPagesUserConfigFactory {
	return config;
}
