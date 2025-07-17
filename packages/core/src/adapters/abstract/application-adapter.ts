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
import type { ApiHandler, ApiHandlerContext } from '../../public-types.ts';
import { FileUtils } from '../../utils/file-utils.module.ts';
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
> implements ApplicationAdapter<TServer>
{
	protected appConfig: EcoPagesAppConfig;
	protected serverOptions: Record<string, any>;
	protected cliArgs: ReturnParseCliArgs;
	protected apiHandlers: ApiHandler[] = [];

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

	private async clearDistFolder(filter: string[] = []): Promise<void> {
		const distPath = this.appConfig.absolutePaths.distDir;
		const distExists = FileUtils.existsSync(distPath);

		if (!distExists) return;

		try {
			await FileUtils.rmAsync(distPath, { recursive: true });
			appLogger.debug(`Cleared dist folder: ${distPath}`);
		} catch (error) {
			appLogger.error(`Error clearing dist folder: ${distPath}`, error as Error);
		}
	}

	/**
	 * Register a GET route handler
	 * The handler expects a context where request.params exists.
	 */
	abstract get<P extends string>(
		path: P,
		handler: (context: ApiHandlerContext<TRequest>) => Promise<Response> | Response,
	): this;

	/**
	 * Register a POST route handler
	 */
	abstract post<P extends string>(
		path: P,
		handler: (context: ApiHandlerContext<TRequest>) => Promise<Response> | Response,
	): this;

	/**
	 * Register a PUT route handler
	 */
	abstract put<P extends string>(
		path: P,
		handler: (context: ApiHandlerContext<TRequest>) => Promise<Response> | Response,
	): this;

	/**
	 * Register a DELETE route handler
	 */
	abstract delete<P extends string>(
		path: P,
		handler: (context: ApiHandlerContext<TRequest>) => Promise<Response> | Response,
	): this;

	/**
	 * Register a PATCH route handler
	 */
	abstract patch<P extends string>(
		path: P,
		handler: (context: ApiHandlerContext<TRequest>) => Promise<Response> | Response,
	): this;

	/**
	 * Register an OPTIONS route handler
	 */
	abstract options<P extends string>(
		path: P,
		handler: (context: ApiHandlerContext<TRequest>) => Promise<Response> | Response,
	): this;

	/**
	 * Register a HEAD route handler
	 */
	abstract head<P extends string>(
		path: P,
		handler: (context: ApiHandlerContext<TRequest>) => Promise<Response> | Response,
	): this;

	/**
	 * Register a route with any HTTP method
	 */
	abstract route<P extends string>(
		path: P,
		method: ApiHandler['method'],
		handler: (context: ApiHandlerContext<TRequest>) => Promise<Response> | Response,
	): this;

	/**
	 * Internal method to add route handlers to the API handlers array
	 */
	protected addRouteHandler<P extends string>(
		path: P,
		method: ApiHandler['method'],
		handler: (context: ApiHandlerContext<any>) => Promise<Response> | Response,
	): this {
		this.apiHandlers.push({
			path,
			method,
			handler: handler as unknown as (context: any) => Promise<Response> | Response,
		});
		return this;
	}

	/**
	 * Get all registered API handlers
	 */
	getApiHandlers(): ApiHandler[] {
		return this.apiHandlers;
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
