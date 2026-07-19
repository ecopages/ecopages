import type { ApplicationRuntimeOptions } from '../../adapters/abstract/application-adapter.ts';

export type DevClientDeliveryMode = 'transform' | 'rolldown';

/**
 * Resolves how native CLI dev serves browser client modules.
 *
 * @remarks
 * Default is `transform` (on-demand esbuild). Set `ECOPAGES_DEV_CLIENT_DELIVERY=rolldown`
 * to use the legacy Rolldown HMR entrypoint path during migration.
 */
export function resolveDevClientDeliveryMode(runtime?: ApplicationRuntimeOptions): DevClientDeliveryMode {
	const fromRuntime = runtime?.devClientDelivery;
	if (fromRuntime === 'transform' || fromRuntime === 'rolldown') {
		return fromRuntime;
	}

	const fromEnv = process.env.ECOPAGES_DEV_CLIENT_DELIVERY?.trim().toLowerCase();
	if (fromEnv === 'rolldown') {
		return 'rolldown';
	}

	if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
		return 'rolldown';
	}

	return 'transform';
}
