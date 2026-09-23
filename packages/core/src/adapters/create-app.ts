import path from 'node:path';
import { finalizeEcoPagesConfig, loadEcoPagesConfig } from '../config/load-eco-config.ts';
import type { EcoPagesUserConfig } from '../config/user-config-types.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { AbstractApplicationAdapter } from './abstract/application-adapter.ts';
import type { ApplicationAdapterOptions } from './abstract/application-adapter.ts';
import { createApp as createBunApp } from './bun/create-app.ts';
import { createNodeApp } from './node/create-app.ts';

export type {
	OnAppStartCallback,
	AppStartInfo,
	StartCallback,
	ListenCallback,
	ApplicationListeningCallback,
	ApplicationListeningInfo,
} from './abstract/application-adapter.ts';

export type EcopagesRuntimeAdapter = 'auto' | 'node' | 'bun';

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

export type EcopagesAppOptions = Omit<ApplicationAdapterOptions, 'appConfig'> &
	EcopagesAppConfigSource & {
		/**
		 * Selects the runtime adapter used by the universal `createApp()` entrypoint.
		 *
		 * @default 'auto'
		 *
		 * @remarks
		 * Use `'auto'` to select Bun when the current process exposes `globalThis.Bun`
		 * and Node otherwise.
		 */
		adapter?: EcopagesRuntimeAdapter;

		/**
		 * Low-level server options passed to the underlying HTTP engine
		 * (e.g. Node `http.createServer` or Bun `Bun.serve`).
		 */
		serverOptions?: Record<string, unknown>;
	};

async function resolveAppConfig(options: EcopagesAppOptions): Promise<EcoPagesAppConfig> {
	if (options.appConfig) {
		return options.appConfig;
	}

	if (options.userConfig) {
		return await finalizeEcoPagesConfig({
			config: options.userConfig,
			configFilePath: path.join(path.resolve(options.userConfig.rootDir), 'eco.config.ts'),
		});
	}

	return await loadEcoPagesConfig({ configFile: options.configFile });
}

export type ResolvedEcopagesAppOptions = ApplicationAdapterOptions & {
	adapter?: EcopagesRuntimeAdapter;
};

export type UniversalEcopagesApp = AbstractApplicationAdapter<ResolvedEcopagesAppOptions, unknown, Request>;

async function createRuntimeApp<WebSocketData = undefined>(
	options: EcopagesAppOptions,
	appConfig: EcoPagesAppConfig,
): Promise<UniversalEcopagesApp> {
	const adapter = options.adapter ?? 'auto';
	const bun = (globalThis as { Bun?: unknown }).Bun;
	const { userConfig: _uc, configFile: _cf, ...baseOptions } = options;
	const runtimeOptions: ResolvedEcopagesAppOptions = {
		...baseOptions,
		appConfig,
	};

	if (adapter === 'bun' || (adapter === 'auto' && bun)) {
		return (await createBunApp<WebSocketData>(runtimeOptions)) as unknown as UniversalEcopagesApp;
	}

	return (await createNodeApp(runtimeOptions)) as unknown as UniversalEcopagesApp;
}

/**
 * Creates and initializes an EcoPages universal application instance.
 *
 * @remarks
 * In standard applications, `createApp()` is called with zero arguments. It automatically
 * resolves and loads `eco.config.ts` from the project root (or via the `ECOPAGES_CONFIG_FILE`
 * environment variable or explicit `configFile` option).
 *
 * In tests or fixture harness environments, you may pass `userConfig` (an unfinalized
 * `EcoPagesUserConfig` object authored via `defineConfig()`) or `appConfig` (a pre-finalized
 * `EcoPagesAppConfig`) to bypass file loading.
 *
 * @example Default usage in `app.ts`
 * ```typescript
 * import { createApp } from '@ecopages/core/create-app';
 *
 * const app = await createApp();
 * app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
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
export async function createApp<WebSocketData = undefined>(
	options: EcopagesAppOptions = {},
): Promise<UniversalEcopagesApp> {
	const appConfig = await resolveAppConfig(options);
	return createRuntimeApp<WebSocketData>(options, appConfig);
}
