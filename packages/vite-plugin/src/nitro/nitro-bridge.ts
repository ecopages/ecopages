type NitroPluginConfig = NonNullable<Parameters<typeof import('nitro/vite').nitro>[0]>;

/**
 * Creates the Nitro plugin config that routes all requests through the
 * Ecopages Nitro handler.
 *
 * @param handlerPath - Absolute path to the generated Nitro request handler file.
 */
export function createNitroBridgeConfig(handlerPath: string): NitroPluginConfig {
	return {
		serverDir: false,
		handlers: [
			{
				route: '/**',
				handler: handlerPath,
			},
		],
	} as NitroPluginConfig;
}
