import type { EcopagesHostConfig } from '../plugin-api.ts';
import type { EcopagesVitePluginOption } from '../types.ts';
import { createNitroBridgeConfig } from './nitro-bridge.ts';
import { writeNitroHandler } from './nitro-handler.ts';

/**
 * Creates an Ecopages host configuration for Nitro-backed apps.
 *
 * Pass the returned value as `host` to the `ecopages()` plugin. This wires
 * the Nitro bridge and generates a Nitro request handler from the project's
 * `eco.config` and `app` entry — no local handler file needed.
 *
 * @example
 * ```ts
 * import { defineConfig } from 'vite';
 * import { ecopages } from '@ecopages/vite-plugin';
 * import { nitroHost } from '@ecopages/vite-plugin/nitro';
 * import { nitro } from 'nitro/vite';
 * import appConfig from './eco.config';
 *
 * export default defineConfig({
 *   plugins: [ecopages({ appConfig, host: nitroHost(nitro) })],
 * });
 * ```
 */
export function nitroHost(nitro: typeof import('nitro/vite').nitro): EcopagesHostConfig {
	return {
		plugins: (api) => {
			const handlerPath = writeNitroHandler(api.appConfig);
			return [...([nitro(createNitroBridgeConfig(handlerPath))] as EcopagesVitePluginOption[])];
		},
	};
}
