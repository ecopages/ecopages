import type {
	EcopagesAppOptions as BunOptions,
	EcopagesApp as BunApp,
} from './adapters/bun/create-app.ts';
import type {
	EcopagesAppOptions as NodeOptions,
	NodeEcopagesApp as NodeApp,
} from './adapters/node/create-app.ts';
import type { AbstractApplicationAdapter } from './adapters/abstract/application-adapter.ts';

export type EcopagesAppOptions = BunOptions | NodeOptions;
export type UniversalEcopagesApp = AbstractApplicationAdapter<EcopagesAppOptions, any, Request>;

export async function createApp<WebSocketData = undefined>(
	options: EcopagesAppOptions,
): Promise<UniversalEcopagesApp> {
	const bun = (globalThis as { Bun?: unknown }).Bun;

	if (bun) {
		const { createApp: createBunApp } = await import('./adapters/bun/create-app.ts');
		return (await createBunApp<WebSocketData>(options as BunOptions)) as unknown as UniversalEcopagesApp;
	}

	const { createNodeApp } = await import('./adapters/node/create-app.ts');
	return (await createNodeApp(options as NodeOptions)) as unknown as UniversalEcopagesApp;
}
