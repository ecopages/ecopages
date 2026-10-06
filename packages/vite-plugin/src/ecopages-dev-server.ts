import path from 'node:path';
import { Readable } from 'node:stream';
import { isDocumentHtmlNavigationFromHeaders } from './document-html-navigation.ts';
import { injectEcopagesDocumentDevBootstrap, stripViteBrowserHmrScripts } from './ecopages-hmr-runtime-injection.ts';
import { normalizeHtmlResponse } from './html-transforms.ts';
import type { ServerResponse } from 'node:http';
import { normalizePath, type Connect, type EnvironmentModuleNode, type ViteDevServer } from 'vite';
import { getAppEntryPath, loadApp, registerHostModuleLoader, type EcopagesEmbeddedApp } from './embedded-dev-server.ts';
import type { EcopagesPluginApi } from './plugin-api.ts';
import { resolveEcopagesDevServerOrigin } from './resolve-vite-dev-origin.ts';
import type { EcopagesVitePlugin } from './types.ts';

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

function logError(server: ViteDevServer, message: string, error: unknown): void {
	server.config.logger.error(`[ecopages] ${message}: ${error instanceof Error ? error.stack : String(error)}`, {
		timestamp: true,
	});
}

/**
 * Loads the app entry inside Vite's SSR module runner and attaches its WebSocket upgrades.
 *
 * @remarks
 * `httpServer` is read by the caller when the server is configured: on restart Vite copies the new server's
 * properties onto the same object, so reading it after the awaits could attach a stale app to the new server.
 *
 * A load failure is logged once and then surfaces through every middleware request that awaits the promise,
 * never as an unhandled rejection.
 */
function startEmbeddedApp(
	server: ViteDevServer,
	httpServer: ViteDevServer['httpServer'],
	api: EcopagesPluginApi,
	appEntryPath: string,
): Promise<EcopagesEmbeddedApp> {
	const appReady = (async () => {
		await registerHostModuleLoader(server, api);
		const app = await loadApp(server, appEntryPath);
		const origin = api.getDevServerOrigin();
		if (origin) {
			app.handleListening(origin);
		}
		if (httpServer && typeof app.attachWebSocketUpgrades === 'function') {
			await app.attachWebSocketUpgrades(httpServer, { passthroughUnmatched: true });
		}
		return app;
	})();
	appReady.catch((error: unknown) => logError(server, 'Failed to load the app entry', error));
	return appReady;
}

/**
 * Whether `file` is the module `entry` or one of the modules it imports, directly or transitively.
 *
 * @remarks
 * Follows `importedModules`, which also holds dynamic imports with a literal specifier. Page, layout
 * and view modules that core loads per request through the host module loader are separate entries,
 * not imports of the app entry, so they are never reached.
 */
function importsFile(entry: EnvironmentModuleNode, file: string): boolean {
	const seen = new Set<EnvironmentModuleNode>();
	const pending = [entry];

	while (pending.length > 0) {
		const node = pending.pop()!;
		if (node.file === file) {
			return true;
		}
		if (seen.has(node)) {
			continue;
		}
		seen.add(node);
		pending.push(...node.importedModules);
	}

	return false;
}

function isConnectDocumentNavigation(req: Connect.IncomingMessage): boolean {
	return isDocumentHtmlNavigationFromHeaders((name) => {
		const value = req.headers[name.toLowerCase()];
		if (Array.isArray(value)) {
			return value[0] ?? null;
		}

		return value ?? null;
	});
}

async function sendAppResponse(
	res: ServerResponse,
	response: Response,
	server: ViteDevServer,
	requestUrl: string,
	req: Connect.IncomingMessage,
): Promise<void> {
	const contentType = response.headers.get('content-type') ?? '';

	if (!contentType.includes('text/html')) {
		await sendWebResponse(res, response);
		return;
	}

	const originalBody = await response.text();
	const normalizedBody = normalizeHtmlResponse(originalBody);
	const isDocumentNavigation = isConnectDocumentNavigation(req);
	let rewrittenBody = isDocumentNavigation
		? await server.transformIndexHtml(requestUrl, normalizedBody)
		: normalizedBody;

	if (isDocumentNavigation) {
		rewrittenBody = stripViteBrowserHmrScripts(rewrittenBody);
		rewrittenBody = injectEcopagesDocumentDevBootstrap(rewrittenBody);
	}

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
 * Whether a change to `file` needs a fresh Vite server: the Vite config or a file it imports, or an env file
 * Vite loads for the current mode.
 *
 * @remarks
 * Vite restarts for these itself only inside its HMR update, which the Ecopages host turns off
 * (`server.hmr: false`). `eco.config.ts` is never one of them, even when the Vite config imports it: the
 * app loads it through the config loader, which keeps it for the life of the process, so a restart would
 * not apply the edit. When `app.ts` imports it, the app-entry rule restarts Vite instead, and the restarted
 * app re-evaluates it.
 */
function isViteConfigFile(server: ViteDevServer, ecoConfigPath: string | undefined, file: string): boolean {
	const { config } = server;
	if (file === ecoConfigPath) {
		return false;
	}
	if (file === config.configFile || config.configFileDependencies.includes(file)) {
		return true;
	}
	if (config.envDir === false || path.dirname(file) !== normalizePath(config.envDir)) {
		return false;
	}
	return ['.env', '.env.local', `.env.${config.mode}`, `.env.${config.mode}.local`].includes(path.basename(file));
}

/**
 * Vite plugin that bridges the Ecopages app into Vite's dev server.
 *
 * Intercepts all non-asset requests, converts them to standard `Request`
 * objects, and delegates to `app.fetch()`. HTML responses are post-processed
 * with {@link normalizeHtmlResponse} to handle Lit SSR slot placement and
 * Vite client injection.
 *
 * @remarks
 * Each Vite server instance loads its own app. Nothing re-imports the app entry, so a change to it or to a
 * module it imports restarts Vite, which loads a fresh app, as does a change to the Vite config or an env
 * file; the app is stopped when its Vite server closes,
 * in middleware mode too. Other modules, such as pages, are re-evaluated per request after Vite invalidates
 * its module graph. While the app failed to load, any added, changed or deleted file restarts Vite, since
 * the failed load may not have recorded the import that broke it.
 */
export function ecopagesDevServer(api: EcopagesPluginApi): EcopagesVitePlugin {
	const appEntryPath = getAppEntryPath(api.appConfig.rootDir);
	const stopAppByEnvironment = new WeakMap<object, () => Promise<void>>();

	return {
		name: 'ecopages:dev-server',
		apply: 'serve',
		configureServer(server: ViteDevServer) {
			const middlewareServer = assertMiddlewareServer(server);
			const httpServer = server.httpServer;
			const ssrEnvironment = server.environments.ssr;
			api.appConfig.runtime = {
				...(api.appConfig.runtime ?? {}),
				devClientOwner: 'host',
			};

			return () => {
				const appReady = startEmbeddedApp(server, httpServer, api, appEntryPath);
				stopAppByEnvironment.set(ssrEnvironment, async () => {
					const app = await appReady.catch(() => undefined);
					await app?.stop?.();
				});

				const ecoConfigPath = api.appConfig.absolutePaths?.config
					? normalizePath(api.appConfig.absolutePaths.config)
					: undefined;
				const restartOnServerChange = async (file: string) => {
					try {
						const appLoaded = await appReady.then(
							() => true,
							() => false,
						);
						if (appLoaded && !isViteConfigFile(server, ecoConfigPath, normalizePath(file))) {
							const entry = await ssrEnvironment.moduleGraph.getModuleByUrl(appEntryPath);
							if (!entry || !importsFile(entry, normalizePath(file))) {
								return;
							}
						}
						server.config.logger.info(
							`[ecopages] ${path.relative(server.config.root, file)} changed, restarting server...`,
							{ timestamp: true },
						);
						await server.restart();
					} catch (error) {
						logError(server, 'Failed to restart Vite after an app entry change', error);
					}
				};
				for (const event of ['add', 'change', 'unlink'] as const) {
					server.watcher.on(event, restartOnServerChange);
				}

				middlewareServer.middlewares.use(async (req, res, next) => {
					try {
						const app = await appReady;
						if (req.headers.upgrade?.toLowerCase() === 'websocket') {
							next();
							return;
						}

						const baseUrl = resolveEcopagesDevServerOrigin(api.getDevServerOrigin(), api.appConfig.baseUrl);
						const webRequest = toWebRequest(req, baseUrl);
						const response = await app.fetch(webRequest);
						await sendAppResponse(res, response, server, webRequest.url, req);
					} catch (error) {
						next(error);
					}
				});
			};
		},
		async closeBundle() {
			const stopApp = stopAppByEnvironment.get(this.environment);
			if (!stopApp) {
				return;
			}
			stopAppByEnvironment.delete(this.environment);
			try {
				await stopApp();
			} catch (error) {
				this.environment.logger.error(
					`[ecopages] Failed to stop the embedded app: ${error instanceof Error ? error.stack : String(error)}`,
				);
			}
		},
	};
}
