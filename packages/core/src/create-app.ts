import type { EcopagesAppOptions as BunOptions, EcopagesApp as BunApp } from './adapters/bun/create-app.ts';
import type { EcopagesAppOptions as NodeOptions } from './adapters/node/create-app.ts';
import { AbstractApplicationAdapter } from './adapters/abstract/application-adapter.ts';
import type { ApiHandler } from './public-types.ts';
import { SharedApplicationAdapter } from './adapters/shared/application-adapter.ts';

export type EcopagesAppOptions = BunOptions | NodeOptions;
export type UniversalEcopagesApp = AbstractApplicationAdapter<EcopagesAppOptions, any, Request>;

async function createRuntimeApp<WebSocketData = undefined>(options: EcopagesAppOptions): Promise<UniversalEcopagesApp> {
	const bun = (globalThis as { Bun?: unknown }).Bun;

	if (bun) {
		const { createApp: createBunApp } = await import('./adapters/bun/create-app.ts');
		return (await createBunApp<WebSocketData>(options as BunOptions)) as unknown as UniversalEcopagesApp;
	}

	const { createNodeApp } = await import('./adapters/node/create-app.ts');
	return (await createNodeApp(options as NodeOptions)) as unknown as UniversalEcopagesApp;
}

export async function createApp<WebSocketData = undefined>(options: EcopagesAppOptions): Promise<UniversalEcopagesApp> {
	return createRuntimeApp<WebSocketData>(options);
}

export class EcopagesApp extends SharedApplicationAdapter<EcopagesAppOptions, unknown, Request> {
	private readonly appOptions: EcopagesAppOptions;
	private runtimeApp: UniversalEcopagesApp | null = null;
	private runtimeAppPromise: Promise<UniversalEcopagesApp> | null = null;

	constructor(options: EcopagesAppOptions) {
		super(options);
		this.appOptions = options;
	}

	private async getRuntimeApp(): Promise<UniversalEcopagesApp> {
		if (this.runtimeApp) {
			return this.runtimeApp;
		}

		if (!this.runtimeAppPromise) {
			this.runtimeAppPromise = createRuntimeApp({
				...this.appOptions,
				clearOutput: false,
			}).then((app) => {
				for (const handler of this.apiHandlers) {
					app.add(handler as ApiHandler<string, Request, any>);
				}

				for (const route of this.staticRoutes) {
					app.static(route.path, route.loader);
				}

				if (this.errorHandler) {
					app.onError(this.errorHandler);
				}

				this.runtimeApp = app;
				return app;
			});
		}

		return this.runtimeAppPromise;
	}

	protected async initializeServerAdapter(): Promise<UniversalEcopagesApp> {
		return this.getRuntimeApp();
	}

	async start(): Promise<unknown> {
		const runtimeApp = await this.getRuntimeApp();
		return runtimeApp.start();
	}

	async fetch(request: Request): Promise<Response> {
		const runtimeApp = await this.getRuntimeApp();
		const candidate = runtimeApp as UniversalEcopagesApp & {
			fetch?: (request: Request) => Promise<Response>;
		};

		if (!candidate.fetch) {
			throw new Error('The selected runtime adapter does not expose fetch()');
		}

		return candidate.fetch(request);
	}
}
