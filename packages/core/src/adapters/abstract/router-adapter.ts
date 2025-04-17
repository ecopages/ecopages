import type { Routes } from '../../internal-types.ts';

/**
 * Abstract base class for router adapters across different runtimes
 */
export abstract class AbstractRouterAdapter<TRouteFormat = any> {
  /**
   * Convert a route path to the format expected by the runtime
   */
  protected abstract convertPath(pathname: string): string;

  /**
   * Create a route handler compatible with the runtime
   */
  protected abstract createRouteHandler(route: any): any;

  /**
   * Adapt framework routes to the format expected by the runtime
   */
  public abstract adaptRoutes(routes: Routes): TRouteFormat;
}
