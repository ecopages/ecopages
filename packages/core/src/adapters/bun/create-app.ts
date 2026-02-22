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
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../constants.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import { getBunRuntime } from '../../utils/runtime.ts';
import type {
	ApiHandler,
	Middleware,
	RouteOptions,
	RouteSchema,
	ApiHandlerContext,
	TypedGroupHandlerContext,
} from '../../public-types.ts';
import {
	AbstractApplicationAdapter,
	type ApplicationAdapterOptions,
	type RouteHandler,
} from '../abstract/application-adapter.ts';
import { type BunServerAdapterResult, createBunServerAdapter } from './server-adapter.ts';

/**
 * Helper type for Bun middleware that only requires extension properties.
 * Automatically applies the BunRequest and Server types.
 *
 * @typeParam TExtension - Additional properties to add to the context
 * @typeParam WebSocketData - WebSocket data type for the server (defaults to undefined)
 *
 * @example
 * ```typescript
 * const authMiddleware: BunMiddleware<{ session: Session }> = async (ctx, next) => {
 *   ctx.session = await getSession(ctx.request);
 *   return next();
 * };
 * ```
 */
export type BunMiddleware<TExtension extends Record<string, any> = {}, WebSocketData = undefined> = Middleware<
	Request,
	Server<WebSocketData>,
	ApiHandlerContext<Request, Server<WebSocketData>> & TExtension
>;

/**
 * Helper type for Bun handler context that only requires extension properties.
 * Automatically applies the BunRequest and Server types.
 *
 * @typeParam TExtension - Additional properties to add to the context
 * @typeParam P - Path pattern for route params inference (defaults to string)
 * @typeParam WebSocketData - WebSocket data type for the server (defaults to undefined)
 *
 * @example
 * ```typescript
 * type AuthenticatedContext = BunHandlerContext<{ session: Session }>;
 *
 * export async function createPost(ctx: AuthenticatedContext) {
 *   const userId = ctx.session.user.id;
 *   return ctx.json({ userId });
 * }
 * ```
 */
export type BunHandlerContext<
	TExtension extends Record<string, any> = {},
	WebSocketData = undefined,
> = ApiHandlerContext<Request, Server<WebSocketData>> & TExtension;

/**
 * Configuration options for the Bun application adapter
 */
export interface EcopagesAppOptions extends ApplicationAdapterOptions {
	appConfig: EcoPagesAppConfig;
	serverOptions?: Record<string, any>;
}

type BunMiddlewareArray<
	WebSocketData,
	TContext extends ApiHandlerContext<Request, Server<WebSocketData>> = ApiHandlerContext<
		Request,
		Server<WebSocketData>
	>,
> = Middleware<Request, Server<WebSocketData>, TContext>[];

type BunHandler<
	WebSocketData,
	TContext extends ApiHandlerContext<Request, Server<WebSocketData>> = ApiHandlerContext<
		Request,
		Server<WebSocketData>
	>,
> = RouteHandler<Request, Server<WebSocketData>, TContext>;

type BunRouteOptions<
	WebSocketData,
	TContext extends ApiHandlerContext<Request, Server<WebSocketData>> = ApiHandlerContext<
		Request,
		Server<WebSocketData>
	>,
> = RouteOptions<Request, Server<WebSocketData>, TContext>;

/**
 * Bun-specific route group builder that properly infers route params from path patterns.
 * When you define a route like `/posts/:slug`, the handler context will have
 * `ctx.request.params.slug` typed as `string`.
 *
 * @typeParam WebSocketData - WebSocket data type for the server
 * @typeParam TContext - Extended context type from middleware (e.g., `{ user: User }`)
 */
export interface BunRouteGroupBuilder<
	WebSocketData = undefined,
	TContext extends ApiHandlerContext<Request, Server<WebSocketData>> = ApiHandlerContext<
		Request,
		Server<WebSocketData>
	>,
> {
	get<TSchema extends RouteSchema = RouteSchema>(
		path: string,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext>) => Promise<Response> | Response,
		options?: RouteOptions<Request, Server<WebSocketData>, TContext> & { schema?: TSchema },
	): BunRouteGroupBuilder<WebSocketData, TContext>;

	post<TSchema extends RouteSchema = RouteSchema>(
		path: string,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext>) => Promise<Response> | Response,
		options?: RouteOptions<Request, Server<WebSocketData>, TContext> & { schema?: TSchema },
	): BunRouteGroupBuilder<WebSocketData, TContext>;

	put<TSchema extends RouteSchema = RouteSchema>(
		path: string,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext>) => Promise<Response> | Response,
		options?: RouteOptions<Request, Server<WebSocketData>, TContext> & { schema?: TSchema },
	): BunRouteGroupBuilder<WebSocketData, TContext>;

	delete<TSchema extends RouteSchema = RouteSchema>(
		path: string,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext>) => Promise<Response> | Response,
		options?: RouteOptions<Request, Server<WebSocketData>, TContext> & { schema?: TSchema },
	): BunRouteGroupBuilder<WebSocketData, TContext>;

	patch<TSchema extends RouteSchema = RouteSchema>(
		path: string,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext>) => Promise<Response> | Response,
		options?: RouteOptions<Request, Server<WebSocketData>, TContext> & { schema?: TSchema },
	): BunRouteGroupBuilder<WebSocketData, TContext>;

	options<TSchema extends RouteSchema = RouteSchema>(
		path: string,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext>) => Promise<Response> | Response,
		options?: RouteOptions<Request, Server<WebSocketData>, TContext> & { schema?: TSchema },
	): BunRouteGroupBuilder<WebSocketData, TContext>;

	head<TSchema extends RouteSchema = RouteSchema>(
		path: string,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext>) => Promise<Response> | Response,
		options?: RouteOptions<Request, Server<WebSocketData>, TContext> & { schema?: TSchema },
	): BunRouteGroupBuilder<WebSocketData, TContext>;
}

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

	private register<
		P extends string,
		TContext extends ApiHandlerContext<Request, Server<WebSocketData>> = ApiHandlerContext<
			Request,
			Server<WebSocketData>
		>,
	>(
		path: P,
		method: ApiHandler['method'],
		handler: BunHandler<WebSocketData, TContext>,
		options?: BunRouteOptions<WebSocketData, TContext>,
	): this {
		return this.addRouteHandler(
			path,
			method,
			handler,
			options?.middleware as BunMiddlewareArray<WebSocketData>,
			options?.schema,
		);
	}

	/**
	 * Register a GET route.
	 *
	 * Supports both inline `(path, handler)` and Bun-only object-form registration.
	 * Prefer inline verbs for direct route definitions and `group(...)` for grouped
	 * route composition.
	 */

	get<
		P extends string,
		TContext extends ApiHandlerContext<Request, Server<WebSocketData>> = ApiHandlerContext<
			Request,
			Server<WebSocketData>
		>,
	>(
		path: P,
		handler: BunHandler<WebSocketData, TContext>,
		options?: BunRouteOptions<WebSocketData, TContext>,
	): this {
		return this.register(path, 'GET', handler, options);
	}

	post<
		P extends string,
		TContext extends ApiHandlerContext<Request, Server<WebSocketData>> = ApiHandlerContext<
			Request,
			Server<WebSocketData>
		>,
	>(
		path: P,
		handler: BunHandler<WebSocketData, TContext>,
		options?: BunRouteOptions<WebSocketData, TContext>,
	): this {
		return this.register(path, 'POST', handler, options);
	}

	put<
		P extends string,
		TContext extends ApiHandlerContext<Request, Server<WebSocketData>> = ApiHandlerContext<
			Request,
			Server<WebSocketData>
		>,
	>(
		path: P,
		handler: BunHandler<WebSocketData, TContext>,
		options?: BunRouteOptions<WebSocketData, TContext>,
	): this {
		return this.register(path, 'PUT', handler, options);
	}

	delete<
		P extends string,
		TContext extends ApiHandlerContext<Request, Server<WebSocketData>> = ApiHandlerContext<
			Request,
			Server<WebSocketData>
		>,
	>(
		path: P,
		handler: BunHandler<WebSocketData, TContext>,
		options?: BunRouteOptions<WebSocketData, TContext>,
	): this {
		return this.register(path, 'DELETE', handler, options);
	}

	patch<
		P extends string,
		TContext extends ApiHandlerContext<Request, Server<WebSocketData>> = ApiHandlerContext<
			Request,
			Server<WebSocketData>
		>,
	>(
		path: P,
		handler: BunHandler<WebSocketData, TContext>,
		options?: BunRouteOptions<WebSocketData, TContext>,
	): this {
		return this.register(path, 'PATCH', handler, options);
	}

	options<
		P extends string,
		TContext extends ApiHandlerContext<Request, Server<WebSocketData>> = ApiHandlerContext<
			Request,
			Server<WebSocketData>
		>,
	>(
		path: P,
		handler: BunHandler<WebSocketData, TContext>,
		routeOptions?: BunRouteOptions<WebSocketData, TContext>,
	): this {
		return this.register(path, 'OPTIONS', handler, routeOptions);
	}

	head<
		P extends string,
		TContext extends ApiHandlerContext<Request, Server<WebSocketData>> = ApiHandlerContext<
			Request,
			Server<WebSocketData>
		>,
	>(
		path: P,
		handler: BunHandler<WebSocketData, TContext>,
		options?: BunRouteOptions<WebSocketData, TContext>,
	): this {
		return this.register(path, 'HEAD', handler, options);
	}

	route<P extends string>(
		path: P,
		method: ApiHandler['method'],
		handler: BunHandler<WebSocketData>,
		options?: BunRouteOptions<WebSocketData>,
	): this {
		return this.register(path, method, handler, options);
	}

	add(handler: ApiHandler<string, Request, Server<WebSocketData>>): this {
		return this.addRouteHandler(
			handler.path,
			handler.method,
			handler.handler as BunHandler<WebSocketData>,
			handler.middleware as BunMiddlewareArray<WebSocketData> | undefined,
			handler.schema,
		);
	}

	/**
	 * Create a route group with shared prefix and middleware.
	 * Routes defined within the group inherit the prefix and middleware.
	 * Context type is automatically inferred from middleware.
	 *
	 * Supports either:
	 * - builder form: `group('/prefix', (builder) => { ... })`
	 * - pre-built object form: `group(groupHandler)`
	 *
	 * @example With context extension from middleware
	 * ```typescript
	 * const authMiddleware: BunMiddleware<{ session: Session }> = async (ctx, next) => {
	 *   ctx.session = await getSession();
	 *   return next();
	 * };
	 *
	 * app.group('/api', (r) => {
	 *   r.get('/profile', async (ctx) => {
	 *     // ctx.session is automatically typed!
	 *     return ctx.json({ userId: ctx.session.userId });
	 *   });
	 * }, { middleware: [authMiddleware] });
	 * ```
	 */
	group<TMiddleware extends readonly Middleware<Request, Server<WebSocketData>, any>[] = []>(
		prefixOrGroup:
			| string
			| {
					prefix: string;
					middleware?: readonly Middleware<Request, Server<WebSocketData>, any>[];
					routes: readonly ApiHandler<any, any, Server<WebSocketData>>[];
			  },
		callback?: (
			builder: BunRouteGroupBuilder<
				WebSocketData,
				TMiddleware extends readonly Middleware<Request, Server<WebSocketData>, infer TContext>[]
					? TContext
					: ApiHandlerContext<Request, Server<WebSocketData>>
			>,
		) => void,
		options?: {
			middleware?: TMiddleware;
		},
	): this {
		if (typeof prefixOrGroup === 'object') {
			return this.registerGroup(prefixOrGroup);
		}

		type TContext = TMiddleware extends readonly Middleware<Request, Server<WebSocketData>, infer TCtx>[]
			? TCtx
			: ApiHandlerContext<Request, Server<WebSocketData>>;
		const normalizedPrefix = prefixOrGroup.endsWith('/') ? prefixOrGroup.slice(0, -1) : prefixOrGroup;
		const groupMiddleware = (options?.middleware ?? []) as Middleware<Request, Server<WebSocketData>, TContext>[];

		const createHandler = (
			method: ApiHandler['method'],
		): BunRouteGroupBuilder<WebSocketData, TContext>[Lowercase<typeof method>] => {
			return ((
				path: string,
				handler: (context: TContext) => Promise<Response> | Response,
				routeOptions?: {
					middleware?: Middleware<Request, Server<WebSocketData>, TContext>[];
					schema?: RouteSchema;
				},
			) => {
				const combinedMiddleware: Middleware<Request, Server<WebSocketData>, TContext>[] = [
					...groupMiddleware,
					...(routeOptions?.middleware ?? []),
				];
				const fullPath = path === '/' ? normalizedPrefix : `${normalizedPrefix}${path}`;
				this.addRouteHandler(
					fullPath,
					method,
					handler as (context: ApiHandlerContext<Request, Server<WebSocketData>>) => Promise<Response> | Response,
					combinedMiddleware.length > 0
						? (combinedMiddleware as Middleware<Request, Server<WebSocketData>>[])
						: undefined,
					routeOptions?.schema,
				);
				return builder;
			}) as BunRouteGroupBuilder<WebSocketData, TContext>[Lowercase<typeof method>];
		};

		const builder: BunRouteGroupBuilder<WebSocketData, TContext> = {
			get: createHandler('GET'),
			post: createHandler('POST'),
			put: createHandler('PUT'),
			delete: createHandler('DELETE'),
			patch: createHandler('PATCH'),
			options: createHandler('OPTIONS'),
			head: createHandler('HEAD'),
		};

		callback!(builder);
		return this;
	}

	private registerGroup(group: {
		prefix: string;
		middleware?: readonly Middleware<Request, Server<WebSocketData>, any>[];
		routes: readonly ApiHandler<string, Request, Server<WebSocketData>>[];
	}): this {
		const normalizedPrefix = group.prefix.endsWith('/') ? group.prefix.slice(0, -1) : group.prefix;
		const groupMiddleware = group.middleware ?? [];

		for (const route of group.routes) {
			const normalizedPath = route.path.startsWith('/') ? route.path : `/${route.path}`;
			const fullPath = route.path === '/' ? normalizedPrefix : `${normalizedPrefix}${normalizedPath}`;
			const combinedMiddleware = [...groupMiddleware, ...(route.middleware ?? [])];

			this.addRouteHandler(
				fullPath,
				route.method,
				route.handler as BunHandler<WebSocketData>,
				combinedMiddleware.length > 0 ? (combinedMiddleware as BunMiddlewareArray<WebSocketData>) : undefined,
				route.schema,
			);
		}

		return this;
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

		const envPort = process.env.ECOPAGES_PORT ? process.env.ECOPAGES_PORT : undefined;
		const envHostname = process.env.ECOPAGES_HOSTNAME;

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

		const bun = getBunRuntime();
		if (!bun) {
			throw new Error('Bun runtime is required for the Bun adapter');
		}

		const bunServer = bun.serve(serverOptions as Bun.Serve.Options<WebSocketData>);
		this.server = bunServer as Server<WebSocketData>;

		await this.serverAdapter.completeInitialization(this.server).catch((error: Error) => {
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
