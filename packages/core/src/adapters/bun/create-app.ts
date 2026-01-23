/**
 * This file contains the implementation of the Bun application adapter for EcoPages.
 * It extends the AbstractApplicationAdapter class and provides methods for handling
 * HTTP requests, initializing the server adapter, and starting the Bun application server.
 * The adapter is designed to work with the Bun runtime and provides a way to create
 * EcoPages applications using Bun's features.
 *
 * @module EcopagesApp
 */

import type { BunRequest, Server } from 'bun';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../constants.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import type { ApiHandler, Middleware, RouteOptions } from '../../public-types.ts';
import {
	AbstractApplicationAdapter,
	type ApplicationAdapterOptions,
	type RouteHandler,
} from '../abstract/application-adapter.ts';
import { type BunServerAdapterResult, createBunServerAdapter } from './server-adapter.ts';

/**
 * Configuration options for the Bun application adapter
 */
export interface EcopagesAppOptions extends ApplicationAdapterOptions {
	appConfig: EcoPagesAppConfig;
	serverOptions?: Record<string, any>;
}

type BunMiddleware<WebSocketData> = Middleware<BunRequest<string>, Server<WebSocketData>>[];
type BunHandler<WebSocketData, P extends string = string> = RouteHandler<BunRequest<P>, Server<WebSocketData>>;
type BunRouteOptions<WebSocketData, P extends string = string> = RouteOptions<BunRequest<P>, Server<WebSocketData>>;

/**
 * Bun-specific application adapter implementation
 * This class extends the {@link AbstractApplicationAdapter}
 * and provides methods for handling HTTP requests and managing the server.
 */

export class EcopagesApp<WebSocketData = undefined> extends AbstractApplicationAdapter<
	EcopagesAppOptions,
	Server<WebSocketData>,
	Request
> {
	serverAdapter: BunServerAdapterResult | undefined;
	private server: Server<WebSocketData> | null = null;

	private register<P extends string>(
		path: P,
		method: ApiHandler['method'],
		handler: BunHandler<WebSocketData, P>,
		options?: BunRouteOptions<WebSocketData, P>,
	): this {
		return this.addRouteHandler(
			path,
			method,
			handler as BunHandler<WebSocketData>,
			options?.middleware as BunMiddleware<WebSocketData>,
			options?.schema,
		);
	}

	get<P extends string>(
		path: P,
		handler: BunHandler<WebSocketData, P>,
		options?: BunRouteOptions<WebSocketData, P>,
	): this {
		return this.register(path, 'GET', handler, options);
	}

	post<P extends string>(
		path: P,
		handler: BunHandler<WebSocketData, P>,
		options?: BunRouteOptions<WebSocketData, P>,
	): this {
		return this.register(path, 'POST', handler, options);
	}

	put<P extends string>(
		path: P,
		handler: BunHandler<WebSocketData, P>,
		options?: BunRouteOptions<WebSocketData, P>,
	): this {
		return this.register(path, 'PUT', handler, options);
	}

	delete<P extends string>(
		path: P,
		handler: BunHandler<WebSocketData, P>,
		options?: BunRouteOptions<WebSocketData, P>,
	): this {
		return this.register(path, 'DELETE', handler, options);
	}

	patch<P extends string>(
		path: P,
		handler: BunHandler<WebSocketData, P>,
		options?: BunRouteOptions<WebSocketData, P>,
	): this {
		return this.register(path, 'PATCH', handler, options);
	}

	options<P extends string>(
		path: P,
		handler: BunHandler<WebSocketData, P>,
		routeOptions?: BunRouteOptions<WebSocketData, P>,
	): this {
		return this.register(path, 'OPTIONS', handler, routeOptions);
	}

	head<P extends string>(
		path: P,
		handler: BunHandler<WebSocketData, P>,
		options?: BunRouteOptions<WebSocketData, P>,
	): this {
		return this.register(path, 'HEAD', handler, options);
	}

	route<P extends string>(
		path: P,
		method: ApiHandler['method'],
		handler: BunHandler<WebSocketData, P>,
		options?: BunRouteOptions<WebSocketData, P>,
	): this {
		return this.register(path, method, handler, options);
	}

	/**
	 * Makes a request to the running server using real HTTP fetch.
	 * This is useful for testing API endpoints.
	 * @param request - URL string or Request object
	 * @returns Promise<Response>
	 */
	public async request(request: string | Request): Promise<Response> {
		const server = this.server;

		if (!server) throw new Error('Server not started. Call start() first.');

		const url = typeof request === 'string' ? `http://${server.hostname}:${server.port}${request}` : request;

		return fetch(url);
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
		const { dev } = this.cliArgs;
		const { port: cliPort, hostname: cliHostname } = this.cliArgs;

		const envPort = import.meta.env.ECOPAGES_PORT ? import.meta.env.ECOPAGES_PORT : undefined;
		const envHostname = import.meta.env.ECOPAGES_HOSTNAME;

		const preferredPort = cliPort ?? envPort ?? DEFAULT_ECOPAGES_PORT;
		const preferredHostname = cliHostname ?? envHostname ?? DEFAULT_ECOPAGES_HOSTNAME;

		appLogger.debug('initializeServerAdapter', {
			dev,
			cliPort,
			cliHostname,
			envPort,
			envHostname,
			preferredPort,
			preferredHostname,
			composedUrl: `http://${preferredHostname}:${preferredPort}`,
		});

		return await createBunServerAdapter({
			runtimeOrigin: `http://${preferredHostname}:${preferredPort}`,
			appConfig: this.appConfig,
			apiHandlers: this.apiHandlers,
			staticRoutes: this.staticRoutes,
			errorHandler: this.errorHandler,
			options: { watch: dev },
			serveOptions: {
				port: preferredPort,
				hostname: preferredHostname,
				...this.serverOptions,
			},
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
		const enableHmr = dev || (!preview && !build);
		const serverOptions = this.serverAdapter.getServerOptions({ enableHmr });

		const bunServer = Bun.serve(serverOptions as Bun.Serve.Options<WebSocketData>);
		this.server = bunServer as Server<WebSocketData>;

		await this.serverAdapter.completeInitialization(this.server).catch((error) => {
			appLogger.error(`Failed to complete initialization: ${error}`);
		});

		if (!this.server) {
			throw new Error('Server failed to start');
		}
		appLogger.info(`Server running at http://${this.server.hostname}:${this.server.port}`);

		if (build || preview) {
			appLogger.debugTime('Building static pages');
			await this.serverAdapter.buildStatic({ preview });
			this.server.stop(true);
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
): Promise<EcopagesApp<WebSocketData>> {
	return new EcopagesApp(options);
}
