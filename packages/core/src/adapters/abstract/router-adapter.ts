/**
 * This file contains the abstract router adapter class and its methods.
 * It is designed to be extended by specific router adapters for different runtimes.
 * The class provides methods for converting paths, creating route handlers,
 * and adapting routes to the expected format of the runtime.
 *
 * @module RouterAdapter
 */

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
