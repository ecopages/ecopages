import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

import type {
	ApiHandler,
	ApiHandlerContext,
	ErrorHandler,
	Middleware,
	RouteGroupBuilder,
	RouteOptions,
	RouteSchema,
	StaticRoute,
	ViewLoader,
	ErrorPageLoaders,
	ErrorPageTemplateProps,
	EcopagesRouteInfo,
	EcopagesWebSocketHandler,
} from '../../types/public-types.ts';
import { ERROR_PAGE_KIND_BY_STATUS, type HttpErrorPageStatus } from '../../errors/http-error-page-contract.ts';
import {
	formatRuntimeServerStartedMessage,
	type EcopagesRuntimeLabel,
	resolveProcessRuntimeLabel,
} from '../../dev/runtime-server-started-message.ts';
import type { ReturnParseCliArgs } from '../../utils/parse-cli-args.ts';
import { startupTrace } from '../../diagnostics/startup-trace.ts';
import { ECOPAGES_DEV_RESTART_EXIT_CODE, ECOPAGES_DEV_RESTART_REASON_ENV } from '../../dev/development-restart.ts';
import { resolveRuntimeBinding } from '../shared/runtime/runtime-app-bootstrap.ts';
import { bindRuntimeServer } from '../shared/runtime/bind-runtime-server.ts';
import type { RuntimeHost } from '../shared/runtime/runtime-host.ts';
import { NodeHttpRequestBridge } from './http-request-bridge.ts';
import { NodeRuntimeHost, type NodeRuntimeServeOptions } from './runtime-host.ts';
import { type NodeServerAdapterResult, createNodeServerAdapter, type NodeServerInstance } from './server-adapter.ts';
import { resolveAppStartRoutes } from '../../utils/ecopages-route-info.ts';
import { requireAppRuntime } from '../../config/app-runtime.ts';
import { createViewModuleLoader } from '../../services/module-loading/view-module-loader.ts';
import { invariant } from '../../utils/invariant.ts';

export interface AppStartInfo {
	origin: string;
	/**
	 * Static-generation routes available when the runtime becomes ready.
	 *
	 * @remarks
	 * Empty when the server adapter has no route registry yet, or when route
	 * resolution fails (failures never block startup). Route resolution completes
	 * before the `onAppStart` callback runs.
	 */
	routes: EcopagesRouteInfo[];
}

export type OnAppStartCallback = (info: AppStartInfo) => void;

export type EcopagesAppRuntimeOptions = {
	appConfig: EcoPagesAppConfig;
	serverOptions?: Record<string, unknown>;
	cliArgs: ReturnParseCliArgs;
};

export type EcopagesAppDependencies = {
	runtimeHost: RuntimeHost<NodeServerInstance, NodeRuntimeServeOptions>;
	createServerAdapter?: (params: Parameters<typeof createNodeServerAdapter>[0]) => Promise<NodeServerAdapterResult>;
};

/**
 * Handler function type for route handlers
 */
export type RouteHandler<
	TRequest extends Request = Request,
	TServer = unknown,
	TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
> = (context: TContext) => Promise<Response> | Response;

export type RouteGroupDefinition<
	TRequest extends Request = Request,
	TServer = unknown,
	TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
> = {
	prefix: string;
	middleware?: readonly Middleware<TRequest, TServer, TContext>[];
	routes: readonly ApiHandler<string, TRequest, TServer>[];
};

function formatRestartStopFailure(error: unknown): string {
	if (error instanceof Error) {
		const nested = error instanceof AggregateError ? error.errors : [];
		const causes = error.cause === undefined ? [] : [`Caused by: ${formatRestartStopFailure(error.cause)}`];
		return [error.stack ?? error.message, ...nested.map(formatRestartStopFailure), ...causes].join('\n');
	}

	if (typeof error === 'string') {
		return error;
	}

	if (typeof error === 'object' && error !== null) {
		try {
			return JSON.stringify(error) ?? String(error);
		} catch {
			return String(error);
		}
	}

	return String(error);
}

export class EcopagesApp implements AsyncDisposable {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly serverOptions: Record<string, unknown>;
	private readonly cliArgs: ReturnParseCliArgs;
	private readonly apiHandlers: ApiHandler<string, Request, unknown>[] = [];
	private readonly staticRoutes: StaticRoute[] = [];
	private errorPageLoaders: ErrorPageLoaders = {};
	private errorHandler?: ErrorHandler<Request, unknown>;
	/**
	 * @remarks WebSocket handler contexts vary by registered route and are erased while handlers wait for transport dispatch.
	 */
	private readonly websocketHandlers: Map<string, EcopagesWebSocketHandler<any, any>> = new Map();
	private onAppStartCallback?: OnAppStartCallback;
	private readonly runtimeLabel: EcopagesRuntimeLabel;
	private readonly runtimeHost: RuntimeHost<NodeServerInstance, NodeRuntimeServeOptions>;
	private readonly serverAdapterFactory: NonNullable<EcopagesAppDependencies['createServerAdapter']>;
	/** @remarks Initialized by the first `fetch()` or `start()` call and exposed for host-level request middleware. */
	public serverAdapter: NodeServerAdapterResult | undefined;
	private server: NodeServerInstance | null = null;
	private stopped = false;

	constructor(options: EcopagesAppRuntimeOptions, dependencies: EcopagesAppDependencies) {
		this.runtimeLabel = resolveProcessRuntimeLabel();
		this.appConfig = options.appConfig;
		this.serverOptions = options.serverOptions || {};
		this.cliArgs = options.cliArgs;
		this.runtimeHost = dependencies.runtimeHost;
		this.serverAdapterFactory =
			dependencies.createServerAdapter ?? ((params) => createNodeServerAdapter(params, this.runtimeHost));

		startupTrace.markConfigReady();
	}

	private register<P extends string, TContext extends ApiHandlerContext<Request, unknown>>(
		path: P,
		method: ApiHandler['method'],
		handler: RouteHandler<Request, unknown, TContext>,
		options?: RouteOptions<Request, unknown, TContext>,
	): this {
		return this.addRouteHandler(path, method, handler, options?.middleware, options?.schema);
	}

	get<P extends string, TContext extends ApiHandlerContext<Request, unknown> = ApiHandlerContext<Request, unknown>>(
		path: P,
		handler: RouteHandler<Request, unknown, TContext>,
		options?: RouteOptions<Request, unknown, TContext>,
	): this {
		return this.register(path, 'GET', handler, options);
	}

	post<P extends string, TContext extends ApiHandlerContext<Request, unknown> = ApiHandlerContext<Request, unknown>>(
		path: P,
		handler: RouteHandler<Request, unknown, TContext>,
		options?: RouteOptions<Request, unknown, TContext>,
	): this {
		return this.register(path, 'POST', handler, options);
	}

	put<P extends string, TContext extends ApiHandlerContext<Request, unknown> = ApiHandlerContext<Request, unknown>>(
		path: P,
		handler: RouteHandler<Request, unknown, TContext>,
		options?: RouteOptions<Request, unknown, TContext>,
	): this {
		return this.register(path, 'PUT', handler, options);
	}

	delete<
		P extends string,
		TContext extends ApiHandlerContext<Request, unknown> = ApiHandlerContext<Request, unknown>,
	>(
		path: P,
		handler: RouteHandler<Request, unknown, TContext>,
		options?: RouteOptions<Request, unknown, TContext>,
	): this {
		return this.register(path, 'DELETE', handler, options);
	}

	patch<P extends string, TContext extends ApiHandlerContext<Request, unknown> = ApiHandlerContext<Request, unknown>>(
		path: P,
		handler: RouteHandler<Request, unknown, TContext>,
		options?: RouteOptions<Request, unknown, TContext>,
	): this {
		return this.register(path, 'PATCH', handler, options);
	}

	options<
		P extends string,
		TContext extends ApiHandlerContext<Request, unknown> = ApiHandlerContext<Request, unknown>,
	>(
		path: P,
		handler: RouteHandler<Request, unknown, TContext>,
		options?: RouteOptions<Request, unknown, TContext>,
	): this {
		return this.register(path, 'OPTIONS', handler, options);
	}

	head<P extends string, TContext extends ApiHandlerContext<Request, unknown> = ApiHandlerContext<Request, unknown>>(
		path: P,
		handler: RouteHandler<Request, unknown, TContext>,
		options?: RouteOptions<Request, unknown, TContext>,
	): this {
		return this.register(path, 'HEAD', handler, options);
	}

	route<P extends string>(
		path: P,
		method: ApiHandler['method'],
		handler: RouteHandler<Request, unknown>,
		options?: RouteOptions<Request, unknown>,
	): this {
		return this.register(path, method, handler, options);
	}

	add(handler: ApiHandler<string, Request, unknown>): this {
		return this.addRouteHandler(handler.path, handler.method, handler.handler, handler.middleware, handler.schema);
	}

	/**
	 * Internal method to add route handlers to the API handlers array
	 */
	private addRouteHandler<TContext extends ApiHandlerContext<Request, unknown> = ApiHandlerContext<Request, unknown>>(
		path: string,
		method: ApiHandler['method'],
		handler: RouteHandler<Request, unknown, TContext>,
		middleware?: Middleware<Request, unknown, TContext>[],
		schema?: ApiHandler['schema'],
	): this {
		invariant(
			typeof path === 'string',
			`Invalid route path for ${method}: expected a string path starting with "/" but received ${Object.prototype.toString.call(path)}. If you're passing a prebuilt ApiHandler, use app.add(handler).`,
		);

		invariant(
			path.startsWith('/'),
			`Invalid route path for ${method}: "${path}". Route paths must start with '/'.`,
		);

		this.apiHandlers.push({
			path,
			method,
			handler: handler as ApiHandler<string, Request, unknown>['handler'],
			middleware: middleware as ApiHandler<string, Request, unknown>['middleware'],
			schema,
		});
		return this;
	}

	group<TContext extends ApiHandlerContext<Request, unknown> = ApiHandlerContext<Request, unknown>>(
		prefixOrGroup: string | RouteGroupDefinition<Request, unknown, TContext>,
		callback?: (builder: RouteGroupBuilder<Request, unknown, TContext>) => void,
		options?: { middleware?: readonly Middleware<Request, unknown, TContext>[] },
	): this {
		if (typeof prefixOrGroup === 'object') {
			return this.registerGroup(prefixOrGroup);
		}

		const normalizedPrefix = prefixOrGroup.endsWith('/') ? prefixOrGroup.slice(0, -1) : prefixOrGroup;
		const groupMiddleware = (options?.middleware ?? []) as Middleware<Request, unknown, TContext>[];

		const createHandler = (
			method: ApiHandler['method'],
		): RouteGroupBuilder<Request, unknown, TContext>[Lowercase<typeof method>] => {
			return ((
				path: string,
				handler: (context: TContext) => Promise<Response> | Response,
				routeOptions?: RouteOptions<Request, unknown, TContext> & { schema?: RouteSchema },
			) => {
				const combinedMiddleware: Middleware<Request, unknown, TContext>[] = [
					...groupMiddleware,
					...(routeOptions?.middleware ?? []),
				];
				const fullPath = path === '/' ? normalizedPrefix : `${normalizedPrefix}${path}`;
				this.addRouteHandler(
					fullPath,
					method,
					handler as RouteHandler<Request, unknown, ApiHandlerContext<Request, unknown>>,
					combinedMiddleware.length > 0
						? (combinedMiddleware as Middleware<Request, unknown, ApiHandlerContext<Request, unknown>>[])
						: undefined,
					routeOptions?.schema,
				);
				return builder;
			}) as RouteGroupBuilder<Request, unknown, TContext>[Lowercase<typeof method>];
		};

		const builder: RouteGroupBuilder<Request, unknown, TContext> = {
			get: createHandler('GET'),
			post: createHandler('POST'),
			put: createHandler('PUT'),
			delete: createHandler('DELETE'),
			patch: createHandler('PATCH'),
			options: createHandler('OPTIONS'),
			head: createHandler('HEAD'),
		};

		callback?.(builder);
		return this;
	}

	private registerGroup<TContext extends ApiHandlerContext<Request, unknown>>(
		group: RouteGroupDefinition<Request, unknown, TContext>,
	): this {
		const normalizedPrefix = group.prefix.endsWith('/') ? group.prefix.slice(0, -1) : group.prefix;
		const groupMiddleware = group.middleware ?? [];

		for (const route of group.routes) {
			const normalizedPath = route.path.startsWith('/') ? route.path : `/${route.path}`;
			const fullPath = route.path === '/' ? normalizedPrefix : `${normalizedPrefix}${normalizedPath}`;
			const combinedMiddleware = [...groupMiddleware, ...(route.middleware ?? [])];
			this.addRouteHandler(
				fullPath,
				route.method,
				route.handler,
				combinedMiddleware.length > 0 ? combinedMiddleware : undefined,
				route.schema,
			);
		}

		return this;
	}

	/**
	 * Register a view for static generation at build time.
	 * The view must have staticPaths defined for dynamic routes.
	 *
	 * String and URL inputs load through the server-module transpiler so HMR and
	 * component identity transforms remain active in development.
	 *
	 * @param path - URL path pattern (e.g., '/posts/:slug')
	 * @param loader - A view loader function, source path, or URL for the eco.page view module
	 * @example
	 * ```typescript
	 * app.static('/login', './src/views/login.kita')
	 * app.static('/posts/:slug', './src/views/post-view.kita')
	 * ```
	 */
	static<P>(path: string, loader: ViewLoader<P> | string | URL): this {
		const resolvedLoader = this.resolveViewLoader(loader);
		this.staticRoutes.push({ path, loader: resolvedLoader });
		return this;
	}

	private resolveViewLoader<P>(loader: ViewLoader<P> | string | URL): ViewLoader<P> {
		return typeof loader === 'string' || loader instanceof URL
			? createViewModuleLoader<P>(this.appConfig, loader)
			: loader;
	}

	/**
	 * Registers a semantic HTML error page used when no filesystem `pages/{status}.*`
	 * file exists.
	 */
	errorPage(status: HttpErrorPageStatus, loader: ViewLoader<ErrorPageTemplateProps> | string | URL): this {
		const kind = ERROR_PAGE_KIND_BY_STATUS[status];
		const resolvedLoader = this.resolveViewLoader<ErrorPageTemplateProps>(loader);
		this.errorPageLoaders = { ...this.errorPageLoaders, [kind]: resolvedLoader };
		return this;
	}

	badRequest(loader: ViewLoader<ErrorPageTemplateProps> | string | URL): this {
		return this.errorPage(400, loader);
	}

	unauthorized(loader: ViewLoader<ErrorPageTemplateProps> | string | URL): this {
		return this.errorPage(401, loader);
	}

	forbidden(loader: ViewLoader<ErrorPageTemplateProps> | string | URL): this {
		return this.errorPage(403, loader);
	}

	/**
	 * Registers the not-found page used when no filesystem `pages/404.*` file exists.
	 */
	notFound(loader: ViewLoader<ErrorPageTemplateProps> | string | URL): this {
		return this.errorPage(404, loader);
	}

	conflict(loader: ViewLoader<ErrorPageTemplateProps> | string | URL): this {
		return this.errorPage(409, loader);
	}

	/**
	 * Registers the server-error page used when no filesystem `pages/500.*` file exists.
	 */
	serverError(loader: ViewLoader<ErrorPageTemplateProps> | string | URL): this {
		return this.errorPage(500, loader);
	}

	getErrorPageLoaders(): ErrorPageLoaders {
		return this.errorPageLoaders;
	}

	/**
	 * Register a WebSocket handler for the given path pattern.
	 *
	 * The runtime adapter handles the HTTP→WebSocket upgrade for this path
	 * and routes lifecycle events to `handler`.
	 *
	 * Supports dynamic segments via `:param` syntax. The handler receives
	 * typed `params` and `search` fields, and a typed `context` produced by
	 * the optional `context()` factory.
	 *
	 * One pattern registration matches infinite path variations. For example,
	 * `app.websocket('/ws/chat/:roomId', handler)` matches `/ws/chat/abc`,
	 * `/ws/chat/xyz`, etc. Each connection receives its own `params.roomId`.
	 *
	 * The Node host handles the HTTP-to-WebSocket upgrade without route code depending on the transport.
	 *
	 * @example
	 * ```typescript
	 * app.websocket<ChatContext, { roomId: string }>('/ws/chat/:roomId', {
	 *   async context({ params, search }) {
	 *     return { username: search.username ?? 'anonymous', roomId: params.roomId };
	 *   },
	 *   onConnect(socket) {
	 *     socket.send(`Welcome to room ${socket.context.roomId}`);
	 *   },
	 *   onMessage(socket, message) {
	 *     if (message.kind === 'text') {
	 *       socket.send(message.text);
	 *     }
	 *   },
	 * });
	 * ```
	 */
	websocket<TContext = unknown, TParams extends Record<string, string> = Record<string, string>>(
		path: string,
		handler: EcopagesWebSocketHandler<TContext, TParams>,
	): this {
		invariant(
			typeof path === 'string' && path.startsWith('/'),
			`app.websocket(): path must be a string starting with "/", got "${path}".`,
		);

		/**
		 * Validate the pattern at registration time. Reject empty segments
		 * and duplicate param names early.
		 */
		const segments = path.split('/').filter(Boolean);
		const paramNames = new Set<string>();
		for (const segment of segments) {
			if (segment.startsWith(':')) {
				const paramName = segment.slice(1);
				invariant(
					paramName.length > 0,
					`app.websocket(): invalid pattern "${path}" — empty param name in segment ":${paramName}".`,
				);
				invariant(
					!paramNames.has(paramName),
					`app.websocket(): invalid pattern "${path}" — duplicate param name ":${paramName}".`,
				);
				paramNames.add(paramName);
			}
		}

		this.websocketHandlers.set(path, handler as EcopagesWebSocketHandler<any, any>);
		return this;
	}

	/**
	 * Register a global error handler for all routes.
	 * Useful for logging, monitoring integration, and custom error formatting.
	 *
	 * @remarks
	 * It receives errors thrown by API handlers and their middleware, and errors
	 * that escape the request pipeline. Page render failures render the error
	 * page instead and do not reach it. Client disconnects answer 499 without
	 * calling it.
	 *
	 * @example
	 * ```typescript
	 * app.onError(async (error, ctx) => {
	 *   logger.error(error);
	 *   return ctx.response.status(500).json({ error: 'Something went wrong' });
	 * });
	 * ```
	 */
	onError(handler: ErrorHandler<Request, unknown>): this {
		this.errorHandler = handler;
		return this;
	}

	private createServerAdapter(
		params: Parameters<typeof createNodeServerAdapter>[0],
	): Promise<NodeServerAdapterResult> {
		return this.serverAdapterFactory(params);
	}

	private resolveRuntimeAssetSetup(): 'start' | 'export' | 'none' {
		const { build, preview, serveOnly } = this.cliArgs;
		if (preview && serveOnly) {
			return 'none';
		}
		return build || preview ? 'export' : 'start';
	}

	private async initializeServerAdapter(): Promise<NodeServerAdapterResult> {
		const binding = resolveRuntimeBinding({
			cliArgs: this.cliArgs,
			serverOptions: this.serverOptions,
		});
		const runtime = requireAppRuntime(this.appConfig);
		runtime.origin = binding.runtimeOrigin;

		return this.createServerAdapter({
			runtime,
			appConfig: this.appConfig,
			apiHandlers: this.apiHandlers,
			staticRoutes: this.staticRoutes,
			errorPageLoaders: this.errorPageLoaders,
			errorHandler: this.errorHandler,
			websocketHandlers: this.websocketHandlers.size > 0 ? this.websocketHandlers : undefined,
			options: { watch: binding.watch },
			serveOptions: binding.serveOptions,
			runtimeAssetSetup: this.resolveRuntimeAssetSetup(),
			allowPortFallback: binding.allowPortFallback,
			onDevelopmentRestart: this.createDevelopmentRestartHandler(),
		});
	}

	/**
	 * Boot the server. When `onAppStart` is passed, it runs once the runtime can take traffic.
	 */
	public async start(onAppStart?: OnAppStartCallback): Promise<NodeServerInstance | void> {
		if (onAppStart) {
			this.onAppStartCallback = onAppStart;
		}

		return await this.bootServer();
	}

	private async bootServer(): Promise<NodeServerInstance | void> {
		if (this.stopped) {
			this.serverAdapter = undefined;
			this.stopped = false;
		}

		if (!this.serverAdapter) {
			this.serverAdapter = await this.initializeServerAdapter();
		}

		if (this.server) {
			return this.server;
		}

		const { build, preview, serveOnly } = this.cliArgs;
		if (preview && serveOnly) {
			const previewOrigin = await this.serverAdapter.servePreviewOnly();
			if (previewOrigin) {
				await this.notifyListening(previewOrigin);
			}
			return;
		}

		if (build || preview) {
			appLogger.debugTime('Building static pages');
			const previewOrigin = await this.serverAdapter.buildStatic({ preview });
			appLogger.debugTimeEnd('Building static pages');

			if (preview && previewOrigin) {
				await this.notifyListening(previewOrigin);
			}

			return;
		}

		const serveOptions = this.serverAdapter.getServerOptions();
		const binding = resolveRuntimeBinding({
			cliArgs: this.cliArgs,
			serverOptions: this.serverOptions,
		});
		startupTrace.beginServerListen();
		const bindingResult = await bindRuntimeServer(this.runtimeHost, {
			startOptions: {
				serveOptions: {
					...serveOptions,
					handleRequest: async (request: Request) => await this.serverAdapter!.handleRequest(request),
				},
			},
			allowPortFallback: binding.allowPortFallback,
			usePortManager: this.cliArgs.dev,
		});
		this.server = bindingResult.server;
		this.serverAdapter.applyBoundPort(bindingResult);

		await this.serverAdapter.completeInitialization(this.server);
		await this.notifyListening(requireAppRuntime(this.appConfig).origin);

		return this.server;
	}

	private logServerStarted(origin: string): void {
		appLogger.info(formatRuntimeServerStartedMessage(this.runtimeLabel, origin));
	}

	private async notifyListening(origin: string): Promise<void> {
		const normalizedOrigin = origin.replace(/\/$/, '');

		startupTrace.markServerListening();

		const restartReason = process.env[ECOPAGES_DEV_RESTART_REASON_ENV];
		if (restartReason) {
			appLogger.info(`Development server restarted (${restartReason}).`);
			delete process.env[ECOPAGES_DEV_RESTART_REASON_ENV];
		}

		if (!this.onAppStartCallback) {
			this.logServerStarted(normalizedOrigin);
			return;
		}

		await this.invokeAppStartCallback(normalizedOrigin);
	}

	/**
	 * Resolves routes exposed on {@link AppStartInfo}.
	 *
	 * @remarks
	 * Uses the initialized server adapter's route lister when one is available.
	 */
	private async resolveAppRoutes(): Promise<EcopagesRouteInfo[]> {
		return resolveAppStartRoutes({
			listStaticGenerationRoutes: this.serverAdapter?.listStaticGenerationRoutes,
			runtimeOrigin: this.appConfig.baseUrl,
		});
	}

	private async invokeAppStartCallback(origin: string): Promise<void> {
		let routes: EcopagesRouteInfo[] = [];
		try {
			routes = await this.resolveAppRoutes();
		} catch (error) {
			appLogger.debug(
				'Failed to resolve app start routes; continuing with empty routes',
				error instanceof Error ? error.message : String(error),
			);
		}

		this.onAppStartCallback?.({ origin, routes });
	}

	/**
	 * Stops the application server and releases runtime resources.
	 *
	 * @remarks
	 * Shutdown releases the bound HTTP server and adapter-owned runtime resources.
	 */
	public async stop(force = true): Promise<void> {
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

	public async [Symbol.asyncDispose](): Promise<void> {
		await this.stop(true);
	}

	/**
	 * Handles a standard Web request without requiring a bound network server.
	 * This is the primary interoperability surface for embedding Ecopages inside
	 * other runtimes and frameworks.
	 */
	public async fetch(request: Request): Promise<Response> {
		if (!this.serverAdapter) {
			this.serverAdapter = await this.initializeServerAdapter();
		}

		return this.serverAdapter.handleRequest(request);
	}

	private createDevelopmentRestartHandler(): (changedFile: string) => Promise<void> {
		return async (changedFile: string) => {
			appLogger.info(`Restarting the development server (${changedFile} changed)...`);
			try {
				await this.stop();
			} catch (error) {
				appLogger.error(
					`Failed to stop the development server before restart: ${formatRestartStopFailure(error)}`,
				);
			}
			process.exit(ECOPAGES_DEV_RESTART_EXIT_CODE);
		};
	}
}

export function createNodeApp(options: EcopagesAppRuntimeOptions): EcopagesApp {
	return new EcopagesApp(options, {
		runtimeHost: new NodeRuntimeHost(new NodeHttpRequestBridge()),
	});
}
