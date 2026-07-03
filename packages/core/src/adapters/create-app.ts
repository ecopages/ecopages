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

export interface EcopagesAppOptions extends ApplicationAdapterOptions {
	appConfig: EcoPagesAppConfig;
	/**
	 * Selects the runtime adapter used by the universal `createApp()` entrypoint.
	 *
	 * @default 'auto'
	 *
	 * @remarks
	 * This is separate from `runtime`, which configures embedded host behavior.
	 * Use `auto` to select Bun when the current process exposes `globalThis.Bun`
	 * and Node otherwise.
	 */
	adapter?: EcopagesRuntimeAdapter;
	serverOptions?: Record<string, any>;
}

export type UniversalEcopagesApp = AbstractApplicationAdapter<EcopagesAppOptions, unknown, Request>;

async function createRuntimeApp<WebSocketData = undefined>(options: EcopagesAppOptions): Promise<UniversalEcopagesApp> {
	const adapter = options.adapter ?? 'auto';
	const bun = (globalThis as { Bun?: unknown }).Bun;

	if (adapter === 'bun' || (adapter === 'auto' && bun)) {
		return (await createBunApp<WebSocketData>(options)) as unknown as UniversalEcopagesApp;
	}

	return (await createNodeApp(options)) as unknown as UniversalEcopagesApp;
}

export async function createApp<WebSocketData = undefined>(options: EcopagesAppOptions): Promise<UniversalEcopagesApp> {
	return createRuntimeApp<WebSocketData>(options);
}
