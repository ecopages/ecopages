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
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../config/constants.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { ApiHandlerContext, RouteGroupBuilder } from '../../types/public-types.ts';
import { SharedApplicationAdapter } from '../shared/application-adapter.ts';
import { resolveRuntimeBinding, resolveStaticRuntimeMode } from '../shared/runtime-app-bootstrap.ts';
import type { RuntimeHost } from '../shared/runtime-host.ts';
import type { StaticPreviewHost } from '../shared/static-preview-host.ts';
import type { EcopagesAppOptions } from '../create-app.ts';
import { type BunServerAdapterResult, createBunServerAdapter } from './server-adapter.ts';
import { BunStaticPreviewHost } from './static-preview-host.ts';
import { BunRuntimeHost } from './runtime-host.ts';

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
	EcopagesAppOptions,
	Server<WebSocketData>,
	Request
> {
	serverAdapter: BunServerAdapterResult | undefined;
	private server: Server<WebSocketData> | null = null;
	private readonly runtimeHost: RuntimeHost<Server<WebSocketData>, Bun.Serve.Options<WebSocketData>>;
	private readonly previewHost: StaticPreviewHost;

	constructor(
		options: EcopagesAppOptions,
		dependencies: {
			runtimeHost: RuntimeHost<Server<WebSocketData>, Bun.Serve.Options<WebSocketData>>;
			previewHost: StaticPreviewHost;
		},
	) {
		super(options);
		this.runtimeHost = dependencies.runtimeHost;
		this.previewHost = dependencies.previewHost;
	}

	public async fetch(request: Request): Promise<Response> {
		if (!this.serverAdapter) {
			this.serverAdapter = await this.initializeServerAdapter();
		}

		await this.serverAdapter.completeInitialization(this.server);
		return this.serverAdapter.handleRequest(request);
	}

	/**
	 * Complete the initialization of the server adapter by processing dynamic routes
	 * @param server The Bun server instance
	 */
	public async completeInitialization(server: Server<WebSocketData>): Promise<void> {
		if (!this.serverAdapter) {
			throw new Error('Server adapter not initialized. Call start() first.');
		}

		await this.serverAdapter.completeInitialization(server);
	}

	/**
	 * Initialize the Bun server adapter
	 */
	protected async initializeServerAdapter(): Promise<BunServerAdapterResult> {
		const binding = resolveRuntimeBinding({
			cliArgs: this.cliArgs,
			serverOptions: this.serverOptions,
		});

		appLogger.debug('initializeServerAdapter', {
			dev: this.cliArgs.dev,
			cliPort: this.cliArgs.port,
			cliHostname: this.cliArgs.hostname,
			envPort: process.env.ECOPAGES_PORT,
			envHostname: process.env.ECOPAGES_HOSTNAME,
			preferredPort: binding.preferredPort,
			preferredHostname: binding.preferredHostname,
			composedUrl: binding.runtimeOrigin,
		});

		return await createBunServerAdapter({
			runtimeOrigin: binding.runtimeOrigin,
			appConfig: this.appConfig,
			apiHandlers: this.apiHandlers,
			staticRoutes: this.staticRoutes,
			errorHandler: this.errorHandler,
			options: { watch: binding.watch },
			serveOptions: binding.serveOptions,
		});
	}

	/**
	 * Start the Bun application server
	 * @param options Optional settings
	 * @param options.autoCompleteInitialization Whether to automatically complete initialization with dynamic routes after server start (defaults to true)
	 */
	public async start(): Promise<Server<WebSocketData> | void> {
		if (!this.serverAdapter) {
			this.serverAdapter = await this.initializeServerAdapter();
		}

		const { dev, preview, build } = this.cliArgs;
		const staticRuntimeMode = resolveStaticRuntimeMode({
			appConfig: this.appConfig,
			cliArgs: this.cliArgs,
		});

		if (staticRuntimeMode.canBuildWithoutRuntimeServer) {
			appLogger.debugTime('Building static pages');
			await this.serverAdapter.buildStatic({ preview });
			appLogger.debugTimeEnd('Building static pages');

			if (build) {
				process.exit(0);
			}

			return;
		}

		const enableHmr = dev || (!preview && !build);
		const serverOptions = this.serverAdapter.getServerOptions({ enableHmr });
		const configuredHostname = String(serverOptions.hostname ?? DEFAULT_ECOPAGES_HOSTNAME);
		const configuredPort = Number(serverOptions.port ?? DEFAULT_ECOPAGES_PORT);
		const runtimeServerOptions =
			(preview || build) && staticRuntimeMode.requiresFetchRuntime
				? {
						...serverOptions,
						port: 0,
					}
				: serverOptions;
		this.server = await this.runtimeHost.start({
			serveOptions: runtimeServerOptions as Bun.Serve.Options<WebSocketData>,
			handleRequest: async () => new Response(null, { status: 500 }),
			onError: async () => {},
		});

		await this.serverAdapter.completeInitialization(this.server).catch((error: Error) => {
			appLogger.error(`Failed to complete initialization: ${error}`);
		});

		if (!this.server) {
			throw new Error('Server failed to start');
		}
		appLogger.info(
			`Server running at ${this.runtimeHost.getOrigin(this.server, runtimeServerOptions as Bun.Serve.Options<WebSocketData>)}`,
		);

		if (build || preview) {
			appLogger.debugTime('Building static pages');
			await this.serverAdapter.buildStatic({ preview: false });
			await this.runtimeHost.stop(this.server, { force: true });

			if (preview) {
				const previewPort = await this.previewHost.start({
					appConfig: this.appConfig,
					hostname: configuredHostname,
					port: configuredPort,
				});

				if (previewPort) {
					appLogger.info(`Preview running at http://${configuredHostname}:${previewPort}`);
				}
			}

			appLogger.debugTimeEnd('Building static pages');

			if (build) {
				process.exit(0);
			}
		}

		return this.server;
	}
}

/**
 * Factory function to create a Bun application
 */
export async function createApp<WebSocketData = undefined>(
	options: EcopagesAppOptions,
): Promise<BunEcopagesApp<WebSocketData>> {
	return new BunEcopagesApp(options, {
		runtimeHost: new BunRuntimeHost<WebSocketData>(),
		previewHost: new BunStaticPreviewHost(),
	});
}
