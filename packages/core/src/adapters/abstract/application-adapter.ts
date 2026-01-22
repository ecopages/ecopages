/**
 * This file defines the abstract class for application adapters in EcoPages.
 * It provides a common interface for different runtimes (e.g., Node.js, Deno) to implement.
 * The class includes methods for handling HTTP requests and managing application state.
 * It also includes a method for parsing command-line arguments.
 *
 * @module ApplicationAdapter
 */

import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import type {
	ApiHandler,
	ApiHandlerContext,
	EcoPageComponent,
	ErrorHandler,
	Middleware,
	RouteGroupBuilder,
	StaticRoute,
} from '../../public-types.ts';
import { fileSystem } from '@ecopages/file-system';
import { parseCliArgs, type ReturnParseCliArgs } from '../../utils/parse-cli-args.ts';

/**
 * Configuration options for application adapters
 */
export interface ApplicationAdapterOptions {
	appConfig: EcoPagesAppConfig;
	serverOptions?: Record<string, any>;
	/**
	 * Options for clearing the output directory before starting the server
	 * @default false
	 */
	clearOutput?: boolean;
}

/**
 * Common interface for application adapters
 */
export interface ApplicationAdapter<T = any> {
	start(): Promise<T | void>;
}

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
	protected apiHandlers: ApiHandler[] = [];
	protected staticRoutes: StaticRoute[] = [];
	protected errorHandler?: ErrorHandler;

	constructor(options: TOptions) {
		this.appConfig = options.appConfig;
		this.serverOptions = options.serverOptions || {};
		this.cliArgs = parseCliArgs();

		if (options.clearOutput) {
			this.clearDistFolder().catch((error) => {
				appLogger.error('Error clearing dist folder', error as Error);
			});
		}
	}

	private async clearDistFolder(_filter: string[] = []): Promise<void> {
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
	 * Register a GET route handler
	 * The handler expects a context where request.params exists.
	 */
	abstract get<P extends string, TSpecRequest extends TRequest = TRequest>(
		path: P,
		handler: (context: ApiHandlerContext<TSpecRequest, TServer>) => Promise<Response> | Response,
	): this;

	/**
	 * Register a POST route handler
	 */
	abstract post<P extends string, TSpecRequest extends TRequest = TRequest>(
		path: P,
		handler: (context: ApiHandlerContext<TSpecRequest, TServer>) => Promise<Response> | Response,
	): this;

	/**
	 * Register a PUT route handler
	 */
	abstract put<P extends string, TSpecRequest extends TRequest = TRequest>(
		path: P,
		handler: (context: ApiHandlerContext<TSpecRequest, TServer>) => Promise<Response> | Response,
	): this;

	/**
	 * Register a DELETE route handler
	 */
	abstract delete<P extends string, TSpecRequest extends TRequest = TRequest>(
		path: P,
		handler: (context: ApiHandlerContext<TSpecRequest, TServer>) => Promise<Response> | Response,
	): this;

	/**
	 * Register a PATCH route handler
	 */
	abstract patch<P extends string, TSpecRequest extends TRequest = TRequest>(
		path: P,
		handler: (context: ApiHandlerContext<TSpecRequest, TServer>) => Promise<Response> | Response,
	): this;

	/**
	 * Register an OPTIONS route handler
	 */
	abstract options<P extends string, TSpecRequest extends TRequest = TRequest>(
		path: P,
		handler: (context: ApiHandlerContext<TSpecRequest, TServer>) => Promise<Response> | Response,
	): this;

	/**
	 * Register a HEAD route handler
	 */
	abstract head<P extends string, TSpecRequest extends TRequest = TRequest>(
		path: P,
		handler: (context: ApiHandlerContext<TSpecRequest, TServer>) => Promise<Response> | Response,
	): this;

	/**
	 * Register a route with any HTTP method
	 */
	abstract route<P extends string, TSpecRequest extends TRequest = TRequest>(
		path: P,
		method: ApiHandler['method'],
		handler: (context: ApiHandlerContext<TSpecRequest, TServer>) => Promise<Response> | Response,
	): this;

	/**
	 * Internal method to add route handlers to the API handlers array
	 */
	protected addRouteHandler<P extends string>(
		path: P,
		method: ApiHandler['method'],
		handler: (context: ApiHandlerContext<any>) => Promise<Response> | Response,
		middleware?: Middleware<any, any>[],
	): this {
		this.apiHandlers.push({
			path,
			method,
			handler: handler as unknown as (context: any) => Promise<Response> | Response,
			middleware,
		});
		return this;
	}

	/**
	 * Create a route group with shared prefix and middleware.
	 * Routes defined within the group inherit the prefix and middleware.
	 * @param prefix - URL prefix for all routes in the group (e.g., '/api/v1')
	 * @param middleware - Array of middleware functions to run before handlers
	 * @param callback - Function that receives a builder to define routes
	 * @example
	 * app.group('/api', [authMiddleware], (r) => {
	 *   r.get('/users', listUsers);
	 *   r.post('/users', createUser);
	 * });
	 */
	group(
		prefix: string,
		middleware: Middleware<TRequest, TServer>[],
		callback: (builder: RouteGroupBuilder<TRequest, TServer>) => void,
	): this {
		const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;

		const builder: RouteGroupBuilder<TRequest, TServer> = {
			get: (path, handler) => {
				this.addRouteHandler(`${normalizedPrefix}${path}`, 'GET', handler as any, middleware as any);
				return builder;
			},
			post: (path, handler) => {
				this.addRouteHandler(`${normalizedPrefix}${path}`, 'POST', handler as any, middleware as any);
				return builder;
			},
			put: (path, handler) => {
				this.addRouteHandler(`${normalizedPrefix}${path}`, 'PUT', handler as any, middleware as any);
				return builder;
			},
			delete: (path, handler) => {
				this.addRouteHandler(`${normalizedPrefix}${path}`, 'DELETE', handler as any, middleware as any);
				return builder;
			},
			patch: (path, handler) => {
				this.addRouteHandler(`${normalizedPrefix}${path}`, 'PATCH', handler as any, middleware as any);
				return builder;
			},
			options: (path, handler) => {
				this.addRouteHandler(`${normalizedPrefix}${path}`, 'OPTIONS', handler as any, middleware as any);
				return builder;
			},
			head: (path, handler) => {
				this.addRouteHandler(`${normalizedPrefix}${path}`, 'HEAD', handler as any, middleware as any);
				return builder;
			},
		};

		callback(builder);
		return this;
	}

	/**
	 * Get all registered API handlers
	 */
	getApiHandlers(): ApiHandler[] {
		return this.apiHandlers;
	}

	/**
	 * Register a view for static generation at build time.
	 * The view must have staticPaths defined for dynamic routes.
	 * @param path - URL path pattern (e.g., '/posts/:slug')
	 * @param view - The eco.page view component to render
	 */
	static<P>(path: string, view: EcoPageComponent<P>): this {
		this.staticRoutes.push({ path, view });
		return this;
	}

	/**
	 * Get all registered static routes
	 */
	getStaticRoutes(): StaticRoute[] {
		return this.staticRoutes;
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
	 * Start the application server
	 */
	public abstract start(): Promise<TServer | void>;

	/**
	 * Makes a request to the running server using real HTTP fetch.
	 * This is useful for testing API endpoints.
	 * @param request - URL string or Request object
	 * @returns Promise<Response>
	 */
	public abstract request(request: string | Request): Promise<Response>;
}
