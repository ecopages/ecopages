/**
 * This file defines the abstract class for application adapters in EcoPages.
 * It provides a common interface for different runtimes (e.g., Node.js, Deno) to implement.
 * The class includes methods for handling HTTP requests and managing application state.
 * It also includes a method for parsing command-line arguments.
 *
 * @module ApplicationAdapter
 */

import path from 'node:path';
import { Processor } from 'src/plugins/processor.ts';
import { FileUtils } from 'src/utils/file-utils.module.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import type { ApiHandler } from '../../public-types.ts';
import { type ReturnParseCliArgs, parseCliArgs } from '../../utils/parse-cli-args.ts';

/**
 * Configuration options for clearing the output directory before starting the server
 */
export interface ClearOutputOptions {
  /**
   * Whether to clear the output directory
   * @default true
   */
  enabled: boolean;
  /**
   * Directories to filter out from deletion
   * @default []
   */
  filter: string[];
}

/**
 * Configuration options for application adapters
 */
export interface ApplicationAdapterOptions {
  appConfig: EcoPagesAppConfig;
  serverOptions?: Record<string, any>;
  /**
   * Options for clearing the output directory before starting the server
   * @default { enabled: true, filter: [] }
   */
  clearOutput?: boolean | ClearOutputOptions;
}

/**
 * Common interface for application adapters
 */
export interface ApplicationAdapter<T = any> {
  start(): Promise<T | void>;
}

/**
 * Handler context containing the request, app config, and other contextual data
 */
export interface HandlerContext<RuntimeSpecificRequest = any> {
  request: RuntimeSpecificRequest;
  appConfig: EcoPagesAppConfig;
}

/**
 * Abstract base class for application adapters across different runtimes
 */
export abstract class AbstractApplicationAdapter<
  TOptions extends ApplicationAdapterOptions = ApplicationAdapterOptions,
  TServer = any,
  TRequest = any,
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

    const clearOutput = options.clearOutput ?? { enabled: true, filter: [] };
    if (clearOutput) {
      const { enabled, filter } = typeof clearOutput === 'boolean' ? { enabled: true, filter: [] } : clearOutput;
      if (enabled) {
        this.clearDistFolder(filter).catch((error) => {
          appLogger.error('Error clearing dist folder', error as Error);
        });
      }
    }
  }

  private async clearDistFolder(filter: string[] = []): Promise<void> {
    const distPath = this.appConfig.absolutePaths.distDir;
    const distExists = FileUtils.existsSync(distPath);

    if (!distExists) return;

    try {
      if (filter.length) {
        const entries = FileUtils.readdirSync(distPath);

        for (const entry of entries) {
          const fullPath = path.join(distPath, entry);
          if (filter.includes(entry)) {
            await FileUtils.rmAsync(fullPath, { recursive: true });
          }
        }
        appLogger.debug(`Cleared dist folder (preserved cache): ${distPath}`);
      } else {
        await FileUtils.rmAsync(distPath, { recursive: true });
        appLogger.debug(`Cleared dist folder: ${distPath}`);
      }
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
    handler: (context: HandlerContext<TRequest>) => Promise<Response> | Response,
  ): this;

  /**
   * Register a POST route handler
   */
  abstract post<P extends string>(
    path: P,
    handler: (context: HandlerContext<TRequest>) => Promise<Response> | Response,
  ): this;

  /**
   * Register a PUT route handler
   */
  abstract put<P extends string>(
    path: P,
    handler: (context: HandlerContext<TRequest>) => Promise<Response> | Response,
  ): this;

  /**
   * Register a DELETE route handler
   */
  abstract delete<P extends string>(
    path: P,
    handler: (context: HandlerContext<TRequest>) => Promise<Response> | Response,
  ): this;

  /**
   * Register a PATCH route handler
   */
  abstract patch<P extends string>(
    path: P,
    handler: (context: HandlerContext<TRequest>) => Promise<Response> | Response,
  ): this;

  /**
   * Register an OPTIONS route handler
   */
  abstract options<P extends string>(
    path: P,
    handler: (context: HandlerContext<TRequest>) => Promise<Response> | Response,
  ): this;

  /**
   * Register a HEAD route handler
   */
  abstract head<P extends string>(
    path: P,
    handler: (context: HandlerContext<TRequest>) => Promise<Response> | Response,
  ): this;

  /**
   * Register a route with any HTTP method
   */
  abstract route<P extends string>(
    path: P,
    method: ApiHandler['method'],
    handler: (context: HandlerContext<TRequest>) => Promise<Response> | Response,
  ): this;

  /**
   * Internal method to add route handlers to the API handlers array
   */
  protected addRouteHandler<P extends string>(
    path: P,
    method: ApiHandler['method'],
    handler: (context: HandlerContext<any>) => Promise<Response> | Response,
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
}
