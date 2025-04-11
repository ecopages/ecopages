import type { RouterTypes } from 'bun';
import { appLogger } from '../../global/app-logger';
import type { Route, Routes } from '../../internal-types';
import type { BunServerAdapter } from './server-adapter';

type BunServerRoutes = {
  [K: string]: RouterTypes.RouteValue<string>;
};

/**
 * The BunRouterAdapter class is responsible for adapting routes from the EcoPages framework to the Bun server's routing format.
 * It handles the conversion of dynamic and catch-all routes, ensuring that the routes are correctly formatted for Bun's routing system.
 */
export class BunRouterAdapter {
  private bunServerAdapter: BunServerAdapter;

  constructor(bunServerAdapter: BunServerAdapter) {
    this.bunServerAdapter = bunServerAdapter;
  }

  /**
   * Converts a pathname from EcoPages format to Bun's routing format.
   * - Converts dynamic routes from [param] to :param
   * - Converts catch-all routes from [...param] to /*
   *
   * @param pathname The pathname to convert
   * @returns The converted pathname in Bun's routing format
   */
  private convertPathToBunFormat(pathname: string): string {
    if (pathname.includes('[...')) {
      return pathname.replace(/\/\[\.{3}.*\]/, '/*');
    }

    const dynamicPath = pathname.replace(/\[([^\]]+)\]/g, (_, param) => `:${param}`);
    return dynamicPath === '' ? '/' : dynamicPath;
  }

  /**
   * Creates a route handler function that delegates request handling to the server adapter.
   * This approach maintains clear separation of concerns:
   * - Router adapter: Translates routes to Bun's format and manages routing concerns
   * - Server adapter: Handles the actual processing of requests and response generation
   *
   * This delegation pattern centralizes error handling and response processing in one place.
   *
   * @param route The route configuration
   * @returns A route handler function compatible with Bun's router
   */
  private createRouteHandler(route: Route): RouterTypes.RouteValue<string> {
    return async (req: Request) => {
      appLogger.debug('[BunRouterAdapter] Handling route request:', {
        url: req.url,
        route: route.pathname,
      });

      try {
        return await this.bunServerAdapter.handleResponse(req);
      } catch (error) {
        if (error instanceof Error) {
          appLogger.error('[BunRouterAdapter] Error handling route:', {
            route: route.pathname,
            message: error.message,
            stack: error.stack,
          });
        } else {
          appLogger.error('[BunRouterAdapter] Error handling route:', {
            route: route.pathname,
            error: String(error),
          });
        }
        return new Response('Internal Server Error', { status: 500 });
      }
    };
  }

  /**
   * Adapts routes from the EcoPages framework to Bun's routing format.
   * This method processes exact, dynamic, and catch-all routes in that order.
   *
   * @param routes The routes to adapt
   * @returns An object containing the adapted routes for Bun
   */
  public adaptRoutes(routes: Routes): BunServerRoutes {
    const bunRoutes: BunServerRoutes = {};

    for (const [_, route] of Object.entries(routes)) {
      if (route.kind === 'exact') {
        const path = this.convertPathToBunFormat(route.pathname);
        bunRoutes[path] = this.createRouteHandler(route);
        appLogger.debug(`[BunRouterAdapter] Added exact route: ${path}`);
      }
    }

    for (const [_, route] of Object.entries(routes)) {
      if (route.kind === 'dynamic') {
        const path = this.convertPathToBunFormat(route.pathname);
        bunRoutes[path] = this.createRouteHandler(route);
        appLogger.debug(`[BunRouterAdapter] Added dynamic route: ${path}`);
      }
    }

    for (const [_, route] of Object.entries(routes)) {
      if (route.kind === 'catch-all') {
        const path = this.convertPathToBunFormat(route.pathname);
        bunRoutes[path] = this.createRouteHandler(route);
        appLogger.debug(`[BunRouterAdapter] Added catch-all route: ${path}`);
      }
    }

    return bunRoutes;
  }
}
