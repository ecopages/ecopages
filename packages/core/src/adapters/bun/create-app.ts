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
import type { ApiHandler } from '../../public-types.ts';
import {
  AbstractApplicationAdapter,
  type ApplicationAdapterOptions,
  type HandlerContext,
} from '../abstract/application-adapter.ts';
import { type BunServerAdapterResult, createBunServerAdapter } from './server-adapter.ts';

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
    handler: (context: HandlerContext<BunRequest<P>>) => Promise<Response> | Response,
  ): this {
    return this.addRouteHandler(path, 'GET', handler);
  }

  post<P extends string>(
    path: P,
    handler: (context: HandlerContext<BunRequest<P>>) => Promise<Response> | Response,
  ): this {
    return this.addRouteHandler(path, 'POST', handler);
  }

  put<P extends string>(
    path: P,
    handler: (context: HandlerContext<BunRequest<P>>) => Promise<Response> | Response,
  ): this {
    return this.addRouteHandler(path, 'PUT', handler);
  }

  delete<P extends string>(
    path: P,
    handler: (context: HandlerContext<BunRequest<P>>) => Promise<Response> | Response,
  ): this {
    return this.addRouteHandler(path, 'DELETE', handler);
  }

  patch<P extends string>(
    path: P,
    handler: (context: HandlerContext<BunRequest<P>>) => Promise<Response> | Response,
  ): this {
    return this.addRouteHandler(path, 'PATCH', handler);
  }

  options<P extends string>(
    path: P,
    handler: (context: HandlerContext<BunRequest<P>>) => Promise<Response> | Response,
  ): this {
    return this.addRouteHandler(path, 'OPTIONS', handler);
  }

  head<P extends string>(
    path: P,
    handler: (context: HandlerContext<BunRequest<P>>) => Promise<Response> | Response,
  ): this {
    return this.addRouteHandler(path, 'HEAD', handler);
  }

  route<P extends string>(
    path: P,
    method: ApiHandler['method'],
    handler: (context: HandlerContext<BunRequest<P>>) => Promise<Response> | Response,
  ): this {
    return this.addRouteHandler(path, method, handler);
  }

  /**
   * Initialize the Bun server adapter
   */
  protected async initializeServerAdapter(): Promise<BunServerAdapterResult> {
    const { dev, port, hostname } = this.cliArgs;

    const processedHandlers = this.apiHandlers.map((handler) => {
      const { path, method, handler: handlerFn } = handler;

      return {
        path,
        method,
        handler: (request: BunRequest<typeof path>) => {
          const context = {
            request,
            appConfig: this.appConfig,
          };

          return (handlerFn as any)(context);
        },
      };
    });

    return await createBunServerAdapter({
      appConfig: this.appConfig,
      apiHandlers: processedHandlers as ApiHandler[],
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
   */
  public async start(): Promise<Server | void> {
    if (!this.serverAdapter) {
      this.serverAdapter = await this.initializeServerAdapter();
    }

    const { dev, preview, build } = this.cliArgs;
    const enableHmr = dev || (!preview && !build);
    const options = this.serverAdapter.getServerOptions({ enableHmr });

    const server = Bun.serve(options);

    if (!build && !preview) {
      appLogger.info(`Server running at http://${server.hostname}:${server.port}`);
    }

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
