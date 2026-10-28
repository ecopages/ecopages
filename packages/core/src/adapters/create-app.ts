import { finalizeEcoPagesConfig } from '../config/assembly/finalize-config.ts';
import { loadEcoPagesConfig, loadEcoPagesConfigFromServerBundle } from '../config/load-eco-config.ts';
import type { EcoPagesUserConfig } from '../config/user-config-types.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { parseCliArgs } from '../utils/parse-cli-args.ts';
import { getProductionServerBundleDir } from '../utils/server-bundle-context.ts';
import { createNodeApp } from './node/create-app.ts';
import type { EcopagesApp } from './node/create-app.ts';

export { EcopagesApp } from './node/create-app.ts';
export type { AppStartInfo, OnAppStartCallback } from './node/create-app.ts';

type EcopagesAppConfigSource =
	| {
			appConfig: EcoPagesAppConfig;
			userConfig?: never;
			configFile?: never;
	  }
	| {
			appConfig?: never;
			userConfig: EcoPagesUserConfig;
			configFile?: never;
	  }
	| {
			appConfig?: never;
			userConfig?: never;
			configFile?: string;
	  };

export type EcopagesAppOptions = EcopagesAppConfigSource & {
	/**
	 * Listen options for the Node HTTP host. Only `port` and `hostname` are read.
	 */
	serverOptions?: Record<string, unknown>;
};

async function resolveAppConfig(
	options: EcopagesAppOptions,
	serverBundleDir: string | undefined,
): Promise<EcoPagesAppConfig> {
	if (options.appConfig) {
		return options.appConfig;
	}

	if (options.userConfig) {
		return await finalizeEcoPagesConfig(options.userConfig);
	}

	return serverBundleDir
		? await loadEcoPagesConfigFromServerBundle({ configFile: options.configFile }, serverBundleDir)
		: await loadEcoPagesConfig({ configFile: options.configFile });
}

/**
 * Creates and initializes an EcoPages application instance.
 *
 * @remarks
 * Command-line options are read once while creating the app and stay fixed for its lifetime.
 * In standard applications, `createApp()` resolves `eco.config.ts` from the project root (or
 * through `ECOPAGES_CONFIG_FILE` or the explicit `configFile` option).
 *
 * @example Default usage in `app.ts`
 * ```typescript
 * import { createApp } from '@ecopages/core/create-app';
 *
 * const app = await createApp();
 * app.get('/api/health', (context) => context.response.json({ status: 'ok' }));
 * await app.start();
 * ```
 *
 * @example With a custom config file path
 * ```typescript
 * const app = await createApp({ configFile: 'eco.custom.config.ts' });
 * ```
 *
 * @example In tests with inline user config
 * ```typescript
 * const app = await createApp({
 *   userConfig: {
 *     rootDir: import.meta.dirname,
 *     integrations: [ecopagesJsxPlugin()],
 *   },
 * });
 * ```
 */
export async function createApp(options: EcopagesAppOptions = {}): Promise<EcopagesApp> {
	const serverBundleDir = getProductionServerBundleDir();
	const appConfig = await resolveAppConfig(options, serverBundleDir);
	const cliArgs = parseCliArgs();
	return createNodeApp({ appConfig, serverOptions: options.serverOptions, cliArgs, serverBundleDir });
}
