import { appLogger } from '../../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { StaticRoute } from '../../../types/public-types.ts';
import type { ExplicitViewRendererResolver } from '../../../route-renderer/route-renderer.ts';
import { prepareExplicitStaticRender } from './explicit-static-render-preparation.ts';
import { matchExplicitStaticPathPattern } from '../../abstract/segment-path-matcher.ts';

export const EXPLICIT_STATIC_ROUTE_MATCHER_ERRORS = {
	missingIntegration: (routePath: string) =>
		`View at ${routePath} is missing __eco.integration. Ensure it's defined with eco.page() and exported as default.`,
	noRendererForIntegration: (integrationName: string) => `No renderer found for integration: ${integrationName}`,
} as const;

export interface ExplicitStaticRouteMatcherOptions {
	appConfig: EcoPagesAppConfig;
	routeRendererFactory: ExplicitViewRendererResolver;
	staticRoutes: StaticRoute[];
}

export interface ExplicitRouteMatch {
	route: StaticRoute;
	params: Record<string, string>;
}

/**
 * Matches and renders explicit static routes declared through `app.static()`.
 */
export class ExplicitStaticRouteMatcher {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly routeRendererFactory: ExplicitViewRendererResolver;
	private readonly staticRoutes: StaticRoute[];

	constructor({ appConfig, routeRendererFactory, staticRoutes }: ExplicitStaticRouteMatcherOptions) {
		this.appConfig = appConfig;
		this.routeRendererFactory = routeRendererFactory;
		this.staticRoutes = staticRoutes;
	}

	/**
	 * Match a request URL against explicit static routes.
	 * Returns the matched route and extracted params, or null if no match.
	 */
	match(url: string): ExplicitRouteMatch | null {
		const pathname = new URL(url).pathname;

		for (const route of this.staticRoutes) {
			const params = matchExplicitStaticPathPattern(route.path, pathname);
			if (params !== null) {
				return { route, params };
			}
		}

		return null;
	}

	/**
	 * Handle a matched explicit static route.
	 * Resolves the loader and renders the view using the appropriate integration renderer.
	 */
	async handleMatch(match: ExplicitRouteMatch): Promise<Response> {
		const { route, params } = match;

		try {
			const mod = await route.loader();
			const view = mod.default;
			const {
				renderer,
				props,
				view: renderableView,
			} = await prepareExplicitStaticRender({
				routePath: route.path,
				view,
				params,
				appConfig: this.appConfig,
				runtimeOrigin: this.appConfig.baseUrl,
				routeRendererFactory: this.routeRendererFactory,
				errors: EXPLICIT_STATIC_ROUTE_MATCHER_ERRORS,
			});

			return renderer.renderToResponse(renderableView, props, {});
		} catch (error) {
			appLogger.error(
				`Error rendering explicit static route ${route.path}:`,
				error instanceof Error ? error : String(error),
			);
			throw error;
		}
	}
}
