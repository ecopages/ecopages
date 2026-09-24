/**
 * This file contains the implementation of the Bun application adapter for EcoPages.
 * It extends the AbstractApplicationAdapter class and provides methods for handling
 * HTTP requests, initializing the server adapter, and starting the Bun application server.
 * The adapter is designed to work with the Bun runtime and provides a way to create
 * EcoPages applications using Bun's features.
 *
 * @module EcopagesApp
 */

import type { Server } from 'bun';
import { appLogger } from '../../global/app-logger.ts';
import type { ApiHandlerContext, EcopagesRouteInfo, RouteGroupBuilder } from '../../types/public-types.ts';
import { SharedApplicationAdapter } from '../shared/runtime/application-adapter.ts';
import { resolveRuntimeBinding } from '../shared/runtime/runtime-app-bootstrap.ts';
import type { WebSocketUpgradeOptions } from '../shared/ws/node-http-websocket-upgrades.ts';
import { bindRuntimeServer } from '../shared/runtime/bind-runtime-server.ts';
import { startupTrace } from '../../diagnostics/startup-trace.ts';
import type { RuntimeHost } from '../shared/runtime/runtime-host.ts';
import type { ResolvedEcopagesAppOptions } from '../create-app.ts';
import { type BunServerAdapterResult, createBunServerAdapter } from './server-adapter.ts';
import { BunRuntimeHost } from './runtime-host.ts';
import { hostOwnsDevClient } from '../../dev/dev-client-ownership.ts';
import { resolveAppStartRoutes } from '../../utils/ecopages-route-info.ts';

/**
 * Bun-specific route group builder that properly infers route params from path patterns.
 * When you define a route like `/posts/:slug`, the handler context will have
 * `ctx.params.slug` typed as `string`.
 *
 * @typeParam WebSocketData - WebSocket data type for the server
 * @typeParam TContext - Extended context type from middleware (e.g., `{ user: User }`)
 */
export type BunRouteGroupBuilder<
	WebSocketData = undefined,
	TContext extends ApiHandlerContext<Request, Server<WebSocketData>> = ApiHandlerContext<
		Request,
		Server<WebSocketData>
	>,
> = RouteGroupBuilder<Request, Server<WebSocketData>, TContext>;

/**
 * Bun-specific application adapter implementation
 * This class extends the {@link AbstractApplicationAdapter}
 * and provides methods for handling HTTP requests and managing the server.
 */

export class BunEcopagesApp<WebSocketData = undefined> extends SharedApplicationAdapter<
	ResolvedEcopagesAppOptions,
	Server<WebSocketData>,
	Request
> {
	serverAdapter: BunServerAdapterResult | undefined;
	private server: Server<WebSocketData> | null = null;
	private stopped = false;
	private readonly runtimeHost: RuntimeHost<Server<WebSocketData>, Bun.Serve.Options<WebSocketData>>;

	constructor(
		options: ResolvedEcopagesAppOptions,
		dependencies: {
			runtimeHost: RuntimeHost<Server<WebSocketData>, Bun.Serve.Options<WebSocketData>>;
		},
	) {
		super(options, 'Bun');
		this.runtimeHost = dependencies.runtimeHost;
	}

	public async fetch(request: Request): Promise<Response> {
		if (!this.serverAdapter) {
			this.serverAdapter = await this.initializeServerAdapter();
		}

		await this.serverAdapter.completeInitialization(this.server);
		return this.serverAdapter.handleRequest(request);
	}

	public async attachWebSocketUpgrades(
		httpServer: import('node:http').Server,
		options?: WebSocketUpgradeOptions,
	): Promise<void> {
		if (!this.serverAdapter) {
			this.serverAdapter = await this.initializeServerAdapter();
		}

		this.serverAdapter.attachUserWebSocketUpgrades(httpServer, options);
	}

	/**
	 * Initialize the Bun server adapter
	 */
	protected async initializeServerAdapter(): Promise<BunServerAdapterResult> {
		const binding = resolveRuntimeBinding({
			cliArgs: this.cliArgs,
			serverOptions: this.serverOptions,
		});
		return createBunServerAdapter({
			runtimeOrigin: binding.runtimeOrigin,
			appConfig: this.appConfig,
			apiHandlers: this.apiHandlers,
			staticRoutes: this.staticRoutes,
			errorPageLoaders: this.getErrorPageLoaders(),
			errorHandler: this.errorHandler,
			websocketHandlers: this.websocketHandlers.size > 0 ? this.websocketHandlers : undefined,
			options: { watch: binding.watch },
			serveOptions: binding.serveOptions,
			hostOwnsDevClient: hostOwnsDevClient(this.runtimeOptions),
			deferRuntimeAssetSetup: this.cliArgs.build || this.cliArgs.preview,
			allowPortFallback: binding.allowPortFallback,
			onDevelopmentRestart: this.createDevelopmentRestartHandler(),
		});
	}

	private async ensureServerAdapterReady(): Promise<BunServerAdapterResult> {
		if (this.stopped) {
			this.serverAdapter = undefined;
			this.stopped = false;
		}
		if (!this.serverAdapter) {
			this.serverAdapter = await this.initializeServerAdapter();
		}
		return this.serverAdapter;
	}

	private async bootPreviewServeOnly(serverAdapter: BunServerAdapterResult): Promise<void> {
		const previewOrigin = await serverAdapter.servePreviewOnly();
		if (previewOrigin) {
			await this.notifyListening(previewOrigin);
		}
	}

	private async bootStaticWithoutRuntimeServer(
		serverAdapter: BunServerAdapterResult,
		preview: boolean,
		build: boolean,
		force: boolean,
	): Promise<void> {
		appLogger.debugTime('Building static pages');
		const previewOrigin = await serverAdapter.buildStatic({ preview, force });
		appLogger.debugTimeEnd('Building static pages');

		if (preview && previewOrigin) {
			await this.notifyListening(previewOrigin);
		}
		if (build) {
			process.exit(0);
		}
	}

	/**
	 * Starts the Bun application server, or runs the preview/build flow when the
	 * CLI requested one.
	 *
	 * @remarks
	 * HMR endpoints and Bun's `development` serve mode follow the `dev` flag only,
	 * matching the options `completeInitialization()` reloads the server with.
	 */
	protected async bootServer(): Promise<Server<WebSocketData> | void> {
		const serverAdapter = await this.ensureServerAdapterReady();
		const { dev, preview, build, force, serveOnly } = this.cliArgs;

		if (preview && serveOnly) {
			await this.bootPreviewServeOnly(serverAdapter);
			return;
		}

		if (build || preview) {
			await this.bootStaticWithoutRuntimeServer(serverAdapter, preview, build, force);
			return;
		}

		const runtimeServerOptions = serverAdapter.getServerOptions({ enableHmr: dev });
		const binding = resolveRuntimeBinding({
			cliArgs: this.cliArgs,
			serverOptions: this.serverOptions,
		});
		startupTrace.beginServerListen();
		const bindingResult = await bindRuntimeServer(this.runtimeHost, {
			startOptions: { serveOptions: runtimeServerOptions as Bun.Serve.Options<WebSocketData> },
			allowPortFallback: binding.allowPortFallback,
			usePortManager: dev,
		});
		this.server = bindingResult.server;
		serverAdapter.applyBoundPort(bindingResult);

		await serverAdapter.completeInitialization(this.server).catch((error: Error) => {
			appLogger.error(`Failed to complete initialization: ${error}`);
		});

		if (!this.server) {
			throw new Error('Server failed to start');
		}

		await this.notifyListening(bindingResult.runtimeOrigin);
		return this.server;
	}

	public override async stop(force = true): Promise<void> {
		if (this.stopped) {
			return;
		}

		if (this.server) {
			const activeServer = this.server;
			this.server = null;
			await this.runtimeHost.stop(activeServer, { force });
		}

		if (this.serverAdapter) {
			await this.serverAdapter.dispose();
		}

		this.stopped = true;
	}

	protected override async resolveAppRoutes(): Promise<EcopagesRouteInfo[]> {
		return resolveAppStartRoutes({
			listStaticGenerationRoutes: this.serverAdapter?.listStaticGenerationRoutes,
			runtimeOrigin: this.appConfig.baseUrl,
		});
	}
}

/**
 * Factory function to create a Bun application
 */
export async function createApp<WebSocketData = undefined>(
	options: ResolvedEcopagesAppOptions,
): Promise<BunEcopagesApp<WebSocketData>> {
	return new BunEcopagesApp(options, {
		runtimeHost: new BunRuntimeHost<WebSocketData>(),
	});
}
