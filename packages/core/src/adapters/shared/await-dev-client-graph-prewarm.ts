import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

/**
 * Waits for integration-owned dev client graph cold batches when enabled.
 *
 * @remarks
 * Blocking behavior is decided per integration via
 * `ECOPAGES_DEV_COLD_CLIENT_GRAPH_BLOCKING`; by default the cold batch runs in
 * the background while the server starts listening.
 */
export async function awaitDevClientGraphPrewarm(appConfig: EcoPagesAppConfig): Promise<void> {
	if (process.env.ECOPAGES_DEV_COLD_CLIENT_GRAPH !== 'true') {
		return;
	}

	await Promise.all(appConfig.integrations.map((integration) => integration.awaitDevClientGraphPrewarm()));
}
