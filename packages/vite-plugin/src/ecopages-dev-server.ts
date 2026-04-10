import path from 'node:path';
import type { Connect, ViteDevServer } from 'vite';
import type { EcopagesPluginApi } from './plugin-api.ts';
import type { EcopagesVitePlugin } from './types.ts';
import { normalizeHtmlResponse } from './html-transforms.ts';

type AppWithFetch = { fetch: (request: Request) => Promise<Response> };

function toWebRequest(req: Connect.IncomingMessage, baseUrl: string): Request {
	const url = new URL(req.originalUrl ?? '/', baseUrl);
	const headers = new Headers();

	for (const [key, value] of Object.entries(req.headers)) {
		if (value === undefined) continue;
		if (Array.isArray(value)) {
			for (const v of value) headers.append(key, v);
		} else {
			headers.set(key, value);
		}
	}

	const init: RequestInit = { method: req.method, headers };

	if (req.method !== 'GET' && req.method !== 'HEAD') {
		init.body = req as unknown as ReadableStream;
		(init as Record<string, unknown>).duplex = 'half';
	}

	return new Request(url, init);
}

async function sendWebResponse(res: Connect.ServerResponse, webResponse: Response): Promise<void> {
	res.statusCode = webResponse.status;
	res.statusMessage = webResponse.statusText;

	for (const [key, value] of webResponse.headers) {
		res.setHeader(key, value);
	}

	if (!webResponse.body) {
		res.end();
		return;
	}

	const reader = webResponse.body.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			res.write(value);
		}
	} finally {
		reader.releaseLock();
		res.end();
	}
}

async function registerHostModuleLoader(server: ViteDevServer): Promise<void> {
	const registry = await server.ssrLoadModule('@ecopages/core/host-module-loader');
	(registry.setHostModuleLoader as (loader: (id: string) => Promise<unknown>) => void)((id: string) =>
		server.ssrLoadModule(id),
	);
}

async function loadApp(server: ViteDevServer, appEntryPath: string): Promise<AppWithFetch> {
	const module = await server.ssrLoadModule(appEntryPath);
	const app = module.app as AppWithFetch | undefined;

	if (!app?.fetch) {
		throw new Error(`[ecopages] App entry at '${appEntryPath}' must export an 'app' with a fetch() method`);
	}

	return app;
}

/**
 * Vite plugin that bridges the Ecopages app into Vite's dev server.
 *
 * Intercepts all non-asset requests, converts them to standard `Request`
 * objects, and delegates to `app.fetch()`. HTML responses are post-processed
 * with {@link normalizeHtmlResponse} to handle Lit SSR slot placement and
 * Vite client injection.
 */
export function ecopagesDevServer(api: EcopagesPluginApi): EcopagesVitePlugin {
	const appEntryPath = path.join(api.appConfig.rootDir, 'app');

	return {
		name: 'ecopages:dev-server',
		configureServer(server: ViteDevServer) {
			const baseUrl = api.appConfig.baseUrl ?? 'http://localhost:3000';

			return () => {
				const hostLoaderReady = registerHostModuleLoader(server);

				server.middlewares.use(async (req, res, next) => {
					await hostLoaderReady;
					try {
						const app = await loadApp(server, appEntryPath);
						const webRequest = toWebRequest(req, baseUrl);
						const response = await app.fetch(webRequest);
						const contentType = response.headers.get('content-type') ?? '';

						if (contentType.includes('text/html')) {
							const originalBody = await response.text();
							const rewrittenBody = normalizeHtmlResponse(originalBody, { injectViteClient: true });
							const headers = new Headers(response.headers);
							headers.delete('content-length');
							headers.delete('etag');
							await sendWebResponse(
								res,
								new Response(rewrittenBody, {
									status: response.status,
									statusText: response.statusText,
									headers,
								}),
							);
						} else {
							await sendWebResponse(res, response);
						}
					} catch (error) {
						next(error);
					}
				});
			};
		},
	};
}
