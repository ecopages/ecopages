/**
 * This file defines the abstract class for application adapters in EcoPages.
 * It provides a common interface for different runtimes (e.g., Node.js, Deno) to implement.
 * The class includes methods for handling HTTP requests and managing application state.
 * It also includes a method for parsing command-line arguments.
 *
 * @module ApplicationAdapter
 */

import { appLogger } from '../../global/app-logger.ts';
import {
	getAppModuleLoader,
	setAppHostModuleLoader,
} from '../../services/module-loading/app-server-module-transpiler.service.ts';
import { getHostModuleLoader } from '../../services/module-loading/host-module-loader-registry.ts';
import type { SourceModuleLoader } from '../../services/module-loading/module-loading-types.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { invariant } from '../../utils/invariant.ts';
import type {
	ApiHandler,
	ApiHandlerContext,
	ErrorHandler,
	Middleware,
	RouteOptions,
	StaticRoute,
	ViewLoader,
	EcopagesRouteInfo,
} from '../../types/public-types.ts';
import type { EcopagesWebSocketHandler } from '../../types/public-types.ts';
import { fileSystem } from '@ecopages/file-system';
import {
	formatRuntimeServerStartedMessage,
	type EcopagesRuntimeLabel,
} from '../../dev/runtime-server-started-message.ts';
import { parseCliArgs, type ReturnParseCliArgs } from '../../utils/parse-cli-args.ts';
import { startupTrace } from '../../diagnostics/startup-trace.ts';

/**
 * Runtime bootstrap options layered on top of the app config.
 *
 * These options let a host runtime embed Ecopages without mutating process
 * globals or app runtime state before calling `createApp()`.
 */
export interface ApplicationRuntimeOptions {
	/**
	 * Forces the app into the embedded-runtime CLI mode used by host
	 * environments.
	 *
	 * When enabled and no explicit `hostModuleLoader` is provided, the
	 * adapter auto-detects a host module loader from the global scope.
	 */
	embedded?: boolean;
	/**
	 * When true, full-page reload signaling is owned by the host dev server
	 * (for example Vite's `full-reload` websocket event) instead of the Ecopages
	 * client bridge.
	 *
	 * @deprecated Prefer `devClientOwner: 'host'`.
	 */
	delegateBrowserReloadToHost?: boolean;
	/**
	 * Selects which layer injects browser dev-client bootstrap (HMR runtime, reload).
	 *
	 * `host` disables core injection and reload signaling so embedded hosts like
	 * Vite own the full dev-client surface.
	 */
	devClientOwner?: 'core' | 'host';
	/**
	 * Explicit source module loader for request-time imports.
	 *
	 * When omitted in embedded mode, the adapter attempts automatic
	 * detection from globals set by the host environment.
	 */
	hostModuleLoader?: SourceModuleLoader;
}

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

/** @deprecated Use {@link AppStartInfo}. */
export type ApplicationListeningInfo = AppStartInfo;

/** @deprecated Use {@link OnAppStartCallback}. */
export type StartCallback = OnAppStartCallback;

/** @deprecated Use {@link OnAppStartCallback}. */
export type ListenCallback = OnAppStartCallback;

/** @deprecated Use {@link OnAppStartCallback}. */
export type ApplicationListeningCallback = OnAppStartCallback;

/**
 * Configuration options for application adapters
 */
export interface ApplicationAdapterOptions {
	appConfig: EcoPagesAppConfig;
	serverOptions?: Record<string, any>;
	runtime?: ApplicationRuntimeOptions;
	/**
	 * Options for clearing the output directory before starting the server
	 * @default false
	 */
	clearOutput?: boolean;
}

/**
 * Common interface for application adapters
 */
export interface ApplicationAdapter<T = any> extends AsyncDisposable {
	/** Boot the server. Pass a callback to run when the runtime is ready (optional). */
	start(onAppStart?: OnAppStartCallback): Promise<T | void>;
	/** Invoked by embedded hosts once the app can take traffic. */
	handleListening(origin: string): void | Promise<void>;
	stop(force?: boolean): Promise<void>;
}

/**
 * Handler function type for route handlers
 */
export type RouteHandler<
	TRequest extends Request = Request,
	TServer = any,
	TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
> = (context: TContext) => Promise<Response> | Response;

export type RouteGroupDefinition<TRequest extends Request = Request, TServer = any> = {
	prefix: string;
	middleware?: readonly Middleware<TRequest, TServer, any>[];
	routes: readonly ApiHandler<string, TRequest, TServer>[];
};

/**
 * Abstract base class for application adapters across different runtimes
 */
export abstract class AbstractApplicationAdapter<
	TOptions extends ApplicationAdapterOptions = ApplicationAdapterOptions,
	TServer = any,
	TRequest extends Request = any,
> implements ApplicationAdapter<TServer> {
	protected appConfig: EcoPagesAppConfig;
	protected serverOptions: Record<string, any>;
	protected cliArgs: ReturnParseCliArgs;
	protected runtimeOptions: ApplicationRuntimeOptions;
	protected apiHandlers: ApiHandler[] = [];
	protected staticRoutes: StaticRoute[] = [];
	protected errorHandler?: ErrorHandler;
	/**
	 * App-level WebSocket handlers keyed by URL path pattern (e.g. '/ws/chat/:id').
	 * Both Bun and Node adapters read this map to register upgrade routes.
	 */
	protected websocketHandlers: Map<string, EcopagesWebSocketHandler<any, any>> = new Map();
	private onAppStartCallback?: OnAppStartCallback;
	protected readonly runtimeLabel: EcopagesRuntimeLabel;

	constructor(options: TOptions, runtimeLabel: EcopagesRuntimeLabel) {
		this.runtimeLabel = runtimeLabel;
		this.appConfig = options.appConfig;
		this.serverOptions = options.serverOptions || {};
		this.runtimeOptions = options.runtime ?? {};
		if (options.runtime) {
			this.appConfig.runtime = {
				...(this.appConfig.runtime ?? {}),
				...options.runtime,
			};
		}
		this.cliArgs = parseCliArgs({ embeddedRuntime: this.runtimeOptions.embedded });

		const hostModuleLoader =
			this.runtimeOptions.hostModuleLoader ?? (this.runtimeOptions.embedded ? getHostModuleLoader() : undefined);

		if (hostModuleLoader) {
			setAppHostModuleLoader(this.appConfig, hostModuleLoader);
		}

		getAppModuleLoader(this.appConfig);

		startupTrace.markConfigReady();

		if (options.clearOutput) {
			this.clearDistFolder().catch((error) => {
				appLogger.error('Error clearing dist folder', error as Error);
			});
		}
	}

	private async clearDistFolder(): Promise<void> {
		const distPath = this.appConfig.absolutePaths.distDir;
		const distExists = fileSystem.exists(distPath);

		if (!distExists) return;

		try {
			await fileSystem.removeAsync(distPath);
			appLogger.debug(`Cleared dist folder: ${distPath}`);
		} catch (error) {
			appLogger.error(`Error clearing dist folder: ${distPath}`, error as Error);
		}
	}

	/**
	 * Register a GET route handler.
	 *
	 * Use verb methods for inline route definitions.
	 * For dynamic HTTP method registration, use `route(...)`.
	 */
	abstract get<
		P extends string,
		TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
	>(
		path: P,
		handler: RouteHandler<TRequest, TServer, TContext>,
		options?: RouteOptions<TRequest, TServer, TContext>,
	): this;

	/**
	 * Register a POST route handler
	 */
	abstract post<
		P extends string,
		TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
	>(
		path: P,
		handler: RouteHandler<TRequest, TServer, TContext>,
		options?: RouteOptions<TRequest, TServer, TContext>,
	): this;

	/**
	 * Register a PUT route handler
	 */
	abstract put<
		P extends string,
		TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
	>(
		path: P,
		handler: RouteHandler<TRequest, TServer, TContext>,
		options?: RouteOptions<TRequest, TServer, TContext>,
	): this;

	/**
	 * Register a DELETE route handler
	 */
	abstract delete<
		P extends string,
		TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
	>(
		path: P,
		handler: RouteHandler<TRequest, TServer, TContext>,
		options?: RouteOptions<TRequest, TServer, TContext>,
	): this;

	/**
	 * Register a PATCH route handler
	 */
	abstract patch<
		P extends string,
		TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
	>(
		path: P,
		handler: RouteHandler<TRequest, TServer, TContext>,
		options?: RouteOptions<TRequest, TServer, TContext>,
	): this;

	/**
	 * Register an OPTIONS route handler
	 */
	abstract options<
		P extends string,
		TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
	>(
		path: P,
		handler: RouteHandler<TRequest, TServer, TContext>,
		options?: RouteOptions<TRequest, TServer, TContext>,
	): this;

	/**
	 * Register a HEAD route handler
	 */
	abstract head<
		P extends string,
		TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
	>(
		path: P,
		handler: RouteHandler<TRequest, TServer, TContext>,
		options?: RouteOptions<TRequest, TServer, TContext>,
	): this;

	/**
	 * Register a route with an explicit HTTP method.
	 *
	 * This is useful when the method is determined programmatically, or when
	 * registering a pre-built route declaration object by forwarding its
	 * `path`, `method`, and `handler` fields.
	 */
	abstract route<P extends string>(
		path: P,
		method: ApiHandler['method'],
		handler: RouteHandler<TRequest, TServer>,
		options?: RouteOptions<TRequest, TServer>,
	): this;

	/**
	 * Register a pre-built API handler declaration.
	 */
	abstract add(handler: ApiHandler<string, TRequest, TServer>): this;

	/**
	 * Internal method to add route handlers to the API handlers array
	 */
	protected addRouteHandler<
		P extends string,
		TSpecRequest extends TRequest = TRequest,
		TSpecServer extends TServer = TServer,
		TContext extends ApiHandlerContext<TSpecRequest, TSpecServer> = ApiHandlerContext<TSpecRequest, TSpecServer>,
	>(
		path: P,
		method: ApiHandler['method'],
		handler: RouteHandler<TSpecRequest, TSpecServer, TContext>,
		middleware?: Middleware<TSpecRequest, TSpecServer, TContext>[],
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
			handler: handler as ApiHandler['handler'],
			middleware: middleware as ApiHandler['middleware'],
			schema,
		});
		return this;
	}

	/**
	 * Create a route group with shared prefix and middleware.
	 * Routes defined within the group inherit the prefix and middleware.
	 *
	 * Each adapter implements this with its own builder type to support
	 * runtime-specific features (e.g., Bun's path parameter inference).
	 * Implementations may also support passing a pre-built group object.
	 *
	 * @param prefix - URL prefix for all routes in the group (e.g., '/api/v1')
	 * @param callback - Function that receives a builder to define routes
	 * @param options - Optional group-level middleware
	 */
	abstract group(
		prefix: string,
		callback: (builder: unknown) => void,
		options?: {
			middleware?: readonly Middleware<TRequest, TServer, any>[];
		},
	): this;

	abstract group(group: RouteGroupDefinition<TRequest, TServer>): this;

	/**
	 * Get all registered API handlers
	 */
	getApiHandlers(): ApiHandler[] {
		return this.apiHandlers;
	}

	/**
	 * Register a view for static generation at build time.
	 * The view must have staticPaths defined for dynamic routes.
	 *
	 * Uses a loader function to enable HMR in development.
	 *
	 * @param path - URL path pattern (e.g., '/posts/:slug')
	 * @param loader - A function that dynamically imports the eco.page view module
	 * @example
	 * ```typescript
	 * app.static('/login', () => import('./src/views/login.kita'))
	 * app.static('/posts/:slug', () => import('./src/views/post-view.kita'))
	 * ```
	 */
	static<P>(path: string, loader: ViewLoader<P>): this {
		this.staticRoutes.push({ path, loader });
		return this;
	}

	/**
	 * Get all registered static routes
	 */
	getStaticRoutes(): StaticRoute[] {
		return this.staticRoutes;
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
	 * Works across both Bun and Node runtimes — no runtime-specific imports needed.
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
	 * Get the registered WebSocket handlers map.
	 *
	 * @returns The map of WebSocket route patterns to handlers
	 */
	getWebsocketHandlers(): Map<string, EcopagesWebSocketHandler<any, any>> {
		return this.websocketHandlers;
	}

	/**
	 * Register a global error handler for all routes.
	 * Useful for logging, monitoring integration, and custom error formatting.
	 *
	 * @example
	 * ```typescript
	 * app.onError(async (error, ctx) => {
	 *   logger.error(error);
	 *   return ctx.response.status(500).json({ error: 'Something went wrong' });
	 * });
	 * ```
	 */
	onError(handler: ErrorHandler<TRequest, TServer>): this {
		this.errorHandler = handler as unknown as ErrorHandler;
		return this;
	}

	/**
	 * Get the registered error handler
	 */
	getErrorHandler(): ErrorHandler | undefined {
		return this.errorHandler;
	}

	/**
	 * Initialize the server adapter based on the runtime
	 */
	protected abstract initializeServerAdapter(): Promise<any>;

	/**
	 * Boot the server. When `onAppStart` is passed, it runs once the runtime can take traffic.
	 * Embedded apps only register the callback — the host (for example Vite) boots the port.
	 */
	public async start(onAppStart?: OnAppStartCallback): Promise<TServer | void> {
		if (onAppStart) {
			this.onAppStartCallback = onAppStart;
		}

		if (this.runtimeOptions.embedded) {
			return;
		}

		return this.bootServer();
	}

	/** Runtime-specific server boot (dev, preview, build). */
	protected abstract bootServer(): Promise<TServer | void>;

	protected logServerStarted(origin: string): void {
		appLogger.info(formatRuntimeServerStartedMessage(this.runtimeLabel, origin));
	}

	/**
	 * Invoked by embedded hosts (for example Vite) once the app can take traffic.
	 */
	public async handleListening(origin: string): Promise<void> {
		await this.notifyListening(origin);
	}

	protected async notifyListening(origin: string): Promise<void> {
		const normalizedOrigin = origin.replace(/\/$/, '');

		startupTrace.markServerListening();

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
	 * Default is empty. Runtime adapters override this to read from the
	 * initialized server route registry.
	 */
	protected async resolveAppRoutes(): Promise<EcopagesRouteInfo[]> {
		return [];
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
	 * Subclasses override this to shut down bound servers, watchers, and other
	 * dev-time resources. The default implementation is a no-op so embedded
	 * adapters that never call `start()` can still be used with `await using`.
	 */
	public async stop(_force = true): Promise<void> {}

	public async [Symbol.asyncDispose](): Promise<void> {
		await this.stop(true);
	}

	/**
	 * Handles a standard Web request without requiring a bound network server.
	 * This is the primary interoperability surface for embedding Ecopages inside
	 * other runtimes and frameworks.
	 */
	public abstract fetch(request: TRequest): Promise<Response>;
}
