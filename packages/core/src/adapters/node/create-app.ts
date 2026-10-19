import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';

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
} from '../../types/contracts.ts';
import { ERROR_PAGE_KIND_BY_STATUS, type HttpErrorPageStatus } from '../../errors/http-error-page-contract.ts';
import {
	formatRuntimeServerStartedMessage,
	type EcopagesRuntimeLabel,
	resolveProcessRuntimeLabel,
} from '../../dev/runtime-server-started-message.ts';
import type { ReturnParseCliArgs } from '../../utils/parse-cli-args.ts';
import { startupTrace } from '../../diagnostics/startup-trace.ts';
import { ECOPAGES_DEV_RESTART_EXIT_CODE, ECOPAGES_DEV_RESTART_REASON_ENV } from '../../dev/development-restart.ts';
import { getEcopagesEnv } from '../../env.ts';
import { resolveRuntimeBinding } from '../shared/runtime/runtime-app-bootstrap.ts';
import { bindRuntimeServer } from '../shared/runtime/bind-runtime-server.ts';
import type { RuntimeHost } from '../shared/runtime/runtime-host.ts';
import { NodeHttpRequestBridge } from './http-request-bridge.ts';
import { NodeRuntimeHost, type NodeRuntimeServeOptions } from './runtime-host.ts';
import { createNodeServerAdapter, type NodeServerAdapter, type NodeServerAdapterParams } from './server-adapter.ts';
import type { NodeServerInstance } from './server-adapter.ts';
import { resolveAppStartRoutes } from '../../utils/ecopages-route-info.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import { createViewModuleLoader } from '../../build/server/view-module-loader.ts';
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
	createServerAdapter?: (params: NodeServerAdapterParams) => NodeServerAdapter | Promise<NodeServerAdapter>;
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

type AppSession = {
	adapter: NodeServerAdapter;
	server: NodeServerInstance | undefined;
};

type AppLifecycle =
	| { phase: 'idle' | 'stopped' }
	| { phase: 'starting'; ready: Promise<AppSession>; session?: AppSession }
	| { phase: 'ready'; session: AppSession }
	| { phase: 'stopping'; stopped: Promise<void> };

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
	private readonly websocketHandlers: Map<string, EcopagesWebSocketHandler<unknown, Record<string, string>>> =
		new Map();
	private onAppStartCallback?: OnAppStartCallback;
	private readonly runtimeLabel: EcopagesRuntimeLabel;
	private readonly runtimeHost: RuntimeHost<NodeServerInstance, NodeRuntimeServeOptions>;
	private readonly serverAdapterFactory: NonNullable<EcopagesAppDependencies['createServerAdapter']>;
	/** @remarks Initialized by the first `fetch()` or `start()` call and exposed for host-level request middleware. */
	public serverAdapter: NodeServerAdapter | undefined;
	private lifecycle: AppLifecycle = { phase: 'idle' };

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
	 * typed `params` and `search` fields (a query key repeated in the URL is an array in `search`), and a typed `context` produced by
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
	 *     const username = Array.isArray(search.username) ? search.username[0] : search.username;
	 *     return { username: username ?? 'anonymous', roomId: params.roomId };
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

		this.websocketHandlers.set(
			path,
			handler as unknown as EcopagesWebSocketHandler<unknown, Record<string, string>>,
		);
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

	private createServerAdapter(params: NodeServerAdapterParams): Promise<NodeServerAdapter> {
		return Promise.resolve(this.serverAdapterFactory(params));
	}

	private resolveRuntimeAssetSetup(): 'start' | 'export' | 'none' {
		const { build, preview, serveOnly } = this.cliArgs;
		if (preview && serveOnly) {
			return 'none';
		}
		return build || preview ? 'export' : 'start';
	}

	private async initializeServerAdapter(): Promise<NodeServerAdapter> {
		const binding = resolveRuntimeBinding({
			cliArgs: this.cliArgs,
			serverOptions: this.serverOptions,
		});
		const runtime = requireAppRuntime(this.appConfig);
		runtime.origin = binding.runtimeOrigin;

		const serverAdapter = await this.createServerAdapter({
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
		try {
			await serverAdapter.initialize();
		} catch (error) {
			try {
				await serverAdapter.dispose();
			} catch (disposeError) {
				throw new AggregateError([error, disposeError], 'Server adapter initialization and cleanup failed');
			}
			throw error;
		}
		return serverAdapter;
	}

	/**
	 * Boot the server. When `onAppStart` is passed, it runs once the runtime can take traffic.
	 *
	 * @remarks
	 * Resolves without a server when `stop()` is called before startup finishes;
	 * that startup does not continue.
	 */
	public async start(onAppStart?: OnAppStartCallback): Promise<NodeServerInstance | void> {
		if (onAppStart) {
			this.onAppStartCallback = onAppStart;
		}

		return await this.bootServer();
	}

	private async bootServer(): Promise<NodeServerInstance | void> {
		const session = await this.getReadySession();
		if (!session || !this.isActive(session)) return;
		const current = this.lifecycle;
		if (current.phase === 'starting') {
			await current.ready;
			return this.isActive(session) ? session.server : undefined;
		}
		if (session.server) return session.server;

		const ready = this.runStartup(session).then(() => session);
		const starting: AppLifecycle = { phase: 'starting', ready, session };
		this.lifecycle = starting;
		try {
			await ready;
			if (this.lifecycle === starting) this.lifecycle = { phase: 'ready', session };
		} catch (error) {
			if (this.lifecycle === starting) this.lifecycle = { phase: 'ready', session };
			throw error;
		}
		return this.isActive(session) ? session.server : undefined;
	}

	/**
	 * Whether `stop()` has not yet claimed `session`.
	 *
	 * @remarks
	 * `stop()` always replaces the lifecycle, so startup work re-checks this after
	 * each await and abandons a session that is being stopped.
	 */
	private isActive(session: AppSession): boolean {
		const current = this.lifecycle;
		return (current.phase === 'ready' || current.phase === 'starting') && current.session === session;
	}

	/** Resolves `undefined` when `stop()` is called before the session is ready. */
	private async getReadySession(): Promise<AppSession | undefined> {
		const current = this.lifecycle;
		if (current.phase === 'ready') return current.session;
		if (current.phase === 'starting') {
			const session = await current.ready;
			return this.isActive(session) ? session : undefined;
		}
		if (current.phase === 'stopping') {
			await current.stopped;
			return await this.getReadySession();
		}

		const ready = this.initializeServerAdapter().then((adapter) => ({ adapter, server: undefined }));
		const starting: AppLifecycle = { phase: 'starting', ready };
		this.lifecycle = starting;
		try {
			const session = await ready;
			if (this.lifecycle !== starting) return undefined;
			this.lifecycle = { phase: 'ready', session };
			this.serverAdapter = session.adapter;
			return session;
		} catch (error) {
			if (this.lifecycle === starting) this.lifecycle = { phase: 'stopped' };
			throw error;
		}
	}

	private async runStartup(session: AppSession): Promise<void> {
		const { build, preview, serveOnly, keepGoing } = this.cliArgs;
		if (preview && serveOnly) {
			const previewOrigin = await session.adapter.servePreviewOnly();
			if (previewOrigin) await this.notifyListening(previewOrigin);
			return;
		}

		if (build || preview) {
			appLogger.debugTime('Building static pages');
			const previewOrigin = await session.adapter.buildStatic({ preview, keepGoing });
			appLogger.debugTimeEnd('Building static pages');
			if (preview && previewOrigin) await this.notifyListening(previewOrigin);
			return;
		}

		const serveOptions = session.adapter.getServerOptions();
		const binding = resolveRuntimeBinding({
			cliArgs: this.cliArgs,
			serverOptions: this.serverOptions,
		});
		startupTrace.beginServerListen();
		const bindingResult = await bindRuntimeServer(this.runtimeHost, {
			startOptions: {
				serveOptions: {
					...serveOptions,
					handleRequest: async (request: Request) => await session.adapter.handleServerRequest(request),
				},
			},
			allowPortFallback: binding.allowPortFallback,
			usePortManager: this.cliArgs.dev,
		});
		session.server = bindingResult.server;
		if (!this.isActive(session)) return;
		session.adapter.applyBoundPort(bindingResult);
		try {
			await session.adapter.completeInitialization(session.server);
		} catch (error) {
			await this.releaseFailedStartup(session, error);
		}
		if (!this.isActive(session)) return;
		await this.notifyListening(requireAppRuntime(this.appConfig).origin);
	}

	private async releaseFailedStartup(session: AppSession, error: unknown): Promise<never> {
		const errors: unknown[] = [error];
		const failedServer = session.server;
		session.server = undefined;
		try {
			if (failedServer) await this.runtimeHost.stop(failedServer, { force: true });
		} catch (stopError) {
			errors.push(stopError);
		}
		try {
			await session.adapter.dispose();
		} catch (disposeError) {
			errors.push(disposeError);
		}
		if (this.serverAdapter === session.adapter) this.serverAdapter = undefined;
		if (this.lifecycle.phase === 'starting') this.lifecycle = { phase: 'stopped' };
		if (errors.length > 1) throw new AggregateError(errors, 'Server startup and cleanup failed');
		throw error;
	}

	private logServerStarted(origin: string): void {
		appLogger.info(formatRuntimeServerStartedMessage(this.runtimeLabel, origin));
	}

	private async notifyListening(origin: string): Promise<void> {
		const normalizedOrigin = origin.replace(/\/$/, '');

		startupTrace.markServerListening();

		const restartReason = getEcopagesEnv(ECOPAGES_DEV_RESTART_REASON_ENV);
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
		const serverAdapter = this.serverAdapter;
		return resolveAppStartRoutes({
			listStaticGenerationRoutes: serverAdapter
				? (input) => serverAdapter.listStaticGenerationRoutes(input)
				: undefined,
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
	 * During startup it waits for the step in flight, which then stops, and
	 * releases whatever that step created.
	 */
	public stop(force = true): Promise<void> {
		const current = this.lifecycle;
		if (current.phase === 'idle' || current.phase === 'stopped') return Promise.resolve();
		if (current.phase === 'stopping') return current.stopped;
		if (current.phase !== 'ready' && current.phase !== 'starting') return Promise.resolve();

		const stopped = Promise.resolve().then(() => this.disposeSession(current, force));
		this.lifecycle = { phase: 'stopping', stopped };
		return stopped;
	}

	private async disposeSession(
		current: Extract<AppLifecycle, { phase: 'ready' | 'starting' }>,
		force: boolean,
	): Promise<void> {
		const session =
			current.phase === 'starting' ? await current.ready.catch(() => current.session) : current.session;

		const errors: unknown[] = [];
		if (session?.server) {
			const activeServer = session.server;
			session.server = undefined;
			try {
				await this.runtimeHost.stop(activeServer, { force });
			} catch (error) {
				errors.push(error);
			}
		}
		if (session) {
			try {
				await session.adapter.dispose();
			} catch (error) {
				errors.push(error);
			}
			if (this.serverAdapter === session.adapter) this.serverAdapter = undefined;
		}
		this.lifecycle = { phase: 'stopped' };
		if (errors.length === 1) throw errors[0];
		if (errors.length > 1) throw new AggregateError(errors, 'Failed to stop the Ecopages app');
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
		const session = await this.getReadySession();
		invariant(session !== undefined, 'The app was stopped before it could handle the request.');
		return session.adapter.handleRequest(request);
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
