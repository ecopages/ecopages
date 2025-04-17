import type { RouterTypes } from 'bun';
import { appLogger } from '../../global/app-logger.ts';
import type { Route, Routes } from '../../internal-types.ts';
import { AbstractRouterAdapter } from '../abstract/router-adapter.ts';
import type { BunServerAdapter, BunServerRoutes } from './server-adapter.ts';

/**
 * Bun-specific router adapter
 */
export class BunRouterAdapter extends AbstractRouterAdapter<BunServerRoutes> {
  private bunServerAdapter: BunServerAdapter;

  constructor(bunServerAdapter: BunServerAdapter) {
    super();
    this.bunServerAdapter = bunServerAdapter;
  }

  /**
   * Converts a pathname from EcoPages format to Bun's routing format.
   * - Converts dynamic routes from [param] to :param
   * - Converts catch-all routes from [...param] to /*
   */
  protected convertPath(pathname: string): string {
    if (pathname.includes('[...')) {
      return pathname.replace(/\/\[\.{3}.*\]/, '/*');
    }

    const dynamicPath = pathname.replace(/\[([^\]]+)\]/g, (_, param) => `:${param}`);
    return dynamicPath === '' ? '/' : dynamicPath;
  }

  /**
   * Creates a route handler function for Bun's router
   */
  protected createRouteHandler(route: Route): RouterTypes.RouteValue<string> {
    return async (req: Request) => {
      appLogger.debug('[BunRouterAdapter] Handling route request:', {
        url: req.url,
        route: route.pathname,
      });

      try {
        return await this.bunServerAdapter.handleRequest(req);
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
   * Adapts framework routes to Bun's routing format
   */
  public adaptRoutes(routes: Routes): BunServerRoutes {
    const bunRoutes: BunServerRoutes = {};

    // Process exact routes first
    for (const [_, route] of Object.entries(routes)) {
      if (route.kind === 'exact') {
        const path = this.convertPath(route.pathname);
        bunRoutes[path] = this.createRouteHandler(route);
        appLogger.debug(`[BunRouterAdapter] Added exact route: ${path}`);
      }
    }

    // Process dynamic routes second
    for (const [_, route] of Object.entries(routes)) {
      if (route.kind === 'dynamic') {
        const path = this.convertPath(route.pathname);
        bunRoutes[path] = this.createRouteHandler(route);
        appLogger.debug(`[BunRouterAdapter] Added dynamic route: ${path}`);
      }
    }

    // Process catch-all routes last
    for (const [_, route] of Object.entries(routes)) {
      if (route.kind === 'catch-all') {
        const path = this.convertPath(route.pathname);
        bunRoutes[path] = this.createRouteHandler(route);
        appLogger.debug(`[BunRouterAdapter] Added catch-all route: ${path}`);
      }
    }

    return bunRoutes;
  }
}
