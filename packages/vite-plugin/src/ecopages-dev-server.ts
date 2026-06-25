import { Readable } from 'node:stream';
import { normalizeHtmlResponse } from './html-transforms.ts';
import type { ServerResponse } from 'node:http';
import type { Connect, ViteDevServer } from 'vite';
import type { EcopagesPluginApi } from './plugin-api.ts';
import { resolveEcopagesDevServerOrigin } from './resolve-vite-dev-origin.ts';
import type { EcopagesVitePlugin } from './types.ts';
import { getAppEntryPath, loadApp, type EcopagesEmbeddedApp, warmupDevServer } from './warmup-dev-server.ts';

type ViteServerWithMiddleware = ViteDevServer & {
	middlewares: {
		use(
			handler: (
				req: Connect.IncomingMessage,
				res: ServerResponse,
				next: (error?: unknown) => void,
			) => void | Promise<void>,
		): void;
	};
};

function assertMiddlewareServer(server: ViteDevServer): ViteServerWithMiddleware {
	if (!server.middlewares || typeof server.middlewares.use !== 'function') {
		throw new Error('[ecopages] ecopagesDevServer requires a Vite dev server with Connect-style middlewares.use()');
	}

	return server as ViteServerWithMiddleware;
}

function toWebHeaders(headers: Connect.IncomingMessage['headers']): Headers {
	const webHeaders = new Headers();

	for (const [key, value] of Object.entries(headers)) {
		if (value === undefined) {
			continue;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				webHeaders.append(key, item);
			}
			continue;
		}

		webHeaders.append(key, value);
	}

	return webHeaders;
}

function toWebRequest(req: Connect.IncomingMessage, baseUrl: string): Request {
	const url = new URL(req.originalUrl ?? '/', baseUrl);

	const init: RequestInit = {
		method: req.method,
		headers: toWebHeaders(req.headers),
		...(req.method !== 'GET' &&
			req.method !== 'HEAD' && {
				body: Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>,
				duplex: 'half',
			}),
	};

	return new Request(url, init);
}

async function sendWebResponse(res: ServerResponse, webResponse: Response): Promise<void> {
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

async function getOrLoadApp(
	server: ViteDevServer,
	api: EcopagesPluginApi,
	appEntryPath: string,
): Promise<EcopagesEmbeddedApp> {
	const cachedApp = api.getCachedApp();
	if (cachedApp) {
		return cachedApp;
	}

	const app = await loadApp(server, appEntryPath);
	api.setCachedApp(app);
	return app;
}

async function attachEmbeddedWebSocketUpgrades(
	server: ViteDevServer,
	api: EcopagesPluginApi,
	appEntryPath: string,
): Promise<void> {
	if (!server.httpServer) {
		return;
	}

	const app = await getOrLoadApp(server, api, appEntryPath);
	if (typeof app.attachWebSocketUpgrades !== 'function') {
		return;
	}

	await app.attachWebSocketUpgrades(server.httpServer, { passthroughUnmatched: true });
}

async function sendAppResponse(
	res: ServerResponse,
	response: Response,
	server: ViteDevServer,
	requestUrl: string,
): Promise<void> {
	const contentType = response.headers.get('content-type') ?? '';

	if (!contentType.includes('text/html')) {
		await sendWebResponse(res, response);
		return;
	}

	const originalBody = await response.text();
	const normalizedBody = normalizeHtmlResponse(originalBody);
	const rewrittenBody = await server.transformIndexHtml(requestUrl, normalizedBody);
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
	const appEntryPath = getAppEntryPath(api.appConfig.rootDir);

	return {
		name: 'ecopages:dev-server',
		apply: 'serve',
		configureServer(server: ViteDevServer) {
			const middlewareServer = assertMiddlewareServer(server);

			return () => {
				void warmupDevServer(server, api, appEntryPath)
					.then(() => {
						api.markDevHostReady();
					})
					.catch((error) => {
						api.markDevHostFailed(error);
					});

				let websocketUpgradesReady: Promise<void> = Promise.resolve();

				if (server.httpServer) {
					websocketUpgradesReady = api
						.getDevHostReady()
						.then(() => attachEmbeddedWebSocketUpgrades(server, api, appEntryPath));
				}

				middlewareServer.middlewares.use(async (req, res, next) => {
					if (req.headers.upgrade?.toLowerCase() === 'websocket') {
						next();
						return;
					}

					try {
						await api.getDevHostReady();
						await websocketUpgradesReady;
						const app = await getOrLoadApp(server, api, appEntryPath);
						const baseUrl = resolveEcopagesDevServerOrigin(api.getDevServerOrigin(), api.appConfig.baseUrl);
						const webRequest = toWebRequest(req, baseUrl);
						const response = await app.fetch(webRequest);
						const requestUrl = webRequest.url;
						await sendAppResponse(res, response, server, requestUrl);
					} catch (error) {
						next(error);
					}
				});
			};
		},
	};
}
