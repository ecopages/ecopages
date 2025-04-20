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
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import type { ApiHandler, BaseRequest } from '../../public-types.ts';
import {
  AbstractApplicationAdapter,
  type ApplicationAdapterOptions,
  type HandlerContext,
} from '../abstract/application-adapter.ts';
import { type BunServerAdapterResult, type BunServerRequest, createBunServerAdapter } from './server-adapter.ts';

/**
 * Configuration options for the Bun application adapter
 */
export interface EcopagesAppOptions extends ApplicationAdapterOptions {
  appConfig: EcoPagesAppConfig;
  serverOptions?: Record<string, any>;
}

/**
 * Bun-specific application adapter implementation
 * This class extends the {@link AbstractApplicationAdapter}
 * and provides methods for handling HTTP requests and managing the server.
 */

export class EcopagesApp extends AbstractApplicationAdapter<EcopagesAppOptions, Server, BunRequest<string>> {
  serverAdapter: BunServerAdapterResult | undefined;

  get<P extends string>(
    path: P,
    handler: (context: HandlerContext<BunServerRequest<P>>) => Promise<Response> | Response,
  ): this {
    return this.addRouteHandler(path, 'GET', handler);
  }

  post<P extends string>(
    path: P,
    handler: (context: HandlerContext<BunServerRequest<P>>) => Promise<Response> | Response,
  ): this {
    return this.addRouteHandler(path, 'POST', handler);
  }

  put<P extends string>(
    path: P,
    handler: (context: HandlerContext<BunServerRequest<P>>) => Promise<Response> | Response,
  ): this {
    return this.addRouteHandler(path, 'PUT', handler);
  }

  delete<P extends string>(
    path: P,
    handler: (context: HandlerContext<BunServerRequest<P>>) => Promise<Response> | Response,
  ): this {
    return this.addRouteHandler(path, 'DELETE', handler);
  }

  patch<P extends string>(
    path: P,
    handler: (context: HandlerContext<BunServerRequest<P>>) => Promise<Response> | Response,
  ): this {
    return this.addRouteHandler(path, 'PATCH', handler);
  }

  options<P extends string>(
    path: P,
    handler: (context: HandlerContext<BunServerRequest<P>>) => Promise<Response> | Response,
  ): this {
    return this.addRouteHandler(path, 'OPTIONS', handler);
  }

  head<P extends string>(
    path: P,
    handler: (context: HandlerContext<BunServerRequest<P>>) => Promise<Response> | Response,
  ): this {
    return this.addRouteHandler(path, 'HEAD', handler);
  }

  route<P extends string>(
    path: P,
    method: ApiHandler['method'],
    handler: (context: HandlerContext<BunServerRequest<P>>) => Promise<Response> | Response,
  ): this {
    return this.addRouteHandler(path, method, handler);
  }

  /**
   * Complete the initialization of the server adapter by processing dynamic routes
   * @param server The Bun server instance
   */
  public async completeInitialization(server: Server): Promise<void> {
    if (!this.serverAdapter) {
      throw new Error('Server adapter not initialized. Call start() first.');
    }

    await this.serverAdapter.completeInitialization(server);
  }

  /**
   * Initialize the Bun server adapter
   */
  protected async initializeServerAdapter(): Promise<BunServerAdapterResult> {
    const { dev, port, hostname } = this.cliArgs;

    return await createBunServerAdapter({
      appConfig: this.appConfig,
      apiHandlers: this.apiHandlers,
      options: { watch: dev },
      serveOptions: {
        port,
        hostname,
        ...this.serverOptions,
      },
    });
  }

  /**
   * Start the Bun application server
   * @param options Optional settings
   * @param options.autoCompleteInitialization Whether to automatically complete initialization with dynamic routes after server start (defaults to true)
   */
  public async start(): Promise<Server | void> {
    if (!this.serverAdapter) {
      this.serverAdapter = await this.initializeServerAdapter();
    }

    const { dev, preview, build } = this.cliArgs;
    const enableHmr = dev || (!preview && !build);
    const serverOptions = this.serverAdapter.getServerOptions({ enableHmr });

    const server = Bun.serve(serverOptions);

    await this.serverAdapter.completeInitialization(server).catch((error) => {
      appLogger.error(`Failed to complete initialization: ${error}`);
    });

    appLogger.info(`Server running at http://${server.hostname}:${server.port}`);

    if (build || preview) {
      appLogger.debugTime('Building static pages');
      await this.serverAdapter.buildStatic({ preview });
      server.stop(true);
      appLogger.debugTimeEnd('Building static pages');

      if (build) {
        process.exit(0);
      }
    }

    return server;
  }
}

/**
 * Factory function to create a Bun application
 */
export async function createApp(
  options: EcopagesAppOptions,
): Promise<AbstractApplicationAdapter<EcopagesAppOptions, Server>> {
  return new EcopagesApp(options);
}
