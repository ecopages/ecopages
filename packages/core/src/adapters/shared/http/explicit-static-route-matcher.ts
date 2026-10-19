import { appLogger } from '../../../global/app-logger.ts';
import { requireAppRuntime } from '../../../utils/app-runtime.ts';
import { formatErrorChain } from '../../../utils/format-error-chain.ts';
import { shouldLogPageFailure } from '../../../errors/http-error-page-contract.ts';
import type { EcoPagesAppConfig } from '../../../config/internal-types.ts';
import type { StaticRoute } from '../../../types/contracts.ts';
import type { ExplicitViewRendererResolver } from '../../../route-renderer/route-renderer.ts';
import { prepareExplicitStaticRender } from '../../../route-renderer/explicit-view-render-preparation.ts';
import {
	matchParsedSegmentPath,
	parseSegmentPath,
	type ParsedSegmentPath,
} from '../../../router/server/segment-path-matcher.ts';

export const EXPLICIT_STATIC_ROUTE_MATCHER_ERRORS = {
	missingIntegration: (routePath: string) =>
		`View at ${routePath} is missing component identity integration. Ensure it's defined with eco.page() and exported as default.`,
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
	match(url: string, parsedPathSegments?: ParsedSegmentPath): ExplicitRouteMatch | null {
		const pathSegments = parsedPathSegments ?? parseSegmentPath(new URL(url).pathname);

		for (const route of this.staticRoutes) {
			const params = matchParsedSegmentPath(route.path, pathSegments, 'explicit');
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
				runtimeOrigin: requireAppRuntime(this.appConfig).origin,
				routeRendererFactory: this.routeRendererFactory,
				errors: EXPLICIT_STATIC_ROUTE_MATCHER_ERRORS,
			});

			return renderer.renderExplicitView(renderableView, props, { params });
		} catch (error) {
			if (shouldLogPageFailure(error)) {
				appLogger.error(`Error rendering explicit static route ${route.path}:`, formatErrorChain(error));
			}
			throw error;
		}
	}
}
