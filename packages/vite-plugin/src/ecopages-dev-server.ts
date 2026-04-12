import path from 'node:path';
import { Readable } from 'node:stream';
import { normalizeHtmlResponse } from './html-transforms.ts';
import type { ServerResponse } from 'node:http';
import type { Connect, ViteDevServer } from 'vite';
import type { EcopagesPluginApi } from './plugin-api.ts';
import type { EcopagesVitePlugin } from './types.ts';

type AppWithFetch = { fetch: (request: Request) => Promise<Response> };
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

async function registerHostModuleLoader(server: ViteDevServer): Promise<void> {
	const registry = await server.ssrLoadModule('@ecopages/core/host-module-loader');

	if (!registry || typeof registry.setHostModuleLoader !== 'function') {
		throw new Error('[ecopages] @ecopages/core/host-module-loader must export setHostModuleLoader()');
	}

	registry.setHostModuleLoader((id: string) => server.ssrLoadModule(id));
}

async function loadApp(server: ViteDevServer, appEntryPath: string): Promise<AppWithFetch> {
	const module = await server.ssrLoadModule(appEntryPath);
	const app = module.app as AppWithFetch | undefined;

	if (!app?.fetch) {
		throw new Error(`[ecopages] App entry at '${appEntryPath}' must export an app.fetch(request) handler`);
	}

	return app;
}

async function sendAppResponse(res: ServerResponse, response: Response): Promise<void> {
	const contentType = response.headers.get('content-type') ?? '';

	if (!contentType.includes('text/html')) {
		await sendWebResponse(res, response);
		return;
	}

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
			const middlewareServer = assertMiddlewareServer(server);

			return () => {
				const hostLoaderReady = registerHostModuleLoader(server);

				middlewareServer.middlewares.use(async (req, res, next) => {
					try {
						await hostLoaderReady;
						const app = await loadApp(server, appEntryPath);
						const webRequest = toWebRequest(req, baseUrl);
						const response = await app.fetch(webRequest);
						await sendAppResponse(res, response);
					} catch (error) {
						next(error);
					}
				});
			};
		},
	};
}
