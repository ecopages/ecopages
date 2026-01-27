import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import type { StaticRoute } from '../../public-types.ts';
import type { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';

export interface ExplicitStaticRouteMatcherOptions {
	appConfig: EcoPagesAppConfig;
	routeRendererFactory: RouteRendererFactory;
	staticRoutes: StaticRoute[];
}

export interface ExplicitRouteMatch {
	route: StaticRoute;
	params: Record<string, string>;
}

export class ExplicitStaticRouteMatcher {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly routeRendererFactory: RouteRendererFactory;
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
			const params = this.matchRoute(route.path, pathname);
			if (params !== null) {
				return { route, params };
			}
		}

		return null;
	}

	/**
	 * Match a route pattern against a pathname.
	 * Supports :param and [param] syntax.
	 * Returns extracted params or null if no match.
	 */
	private matchRoute(pattern: string, pathname: string): Record<string, string> | null {
		const patternSegments = pattern.split('/').filter(Boolean);
		const pathSegments = pathname.split('/').filter(Boolean);

		if (patternSegments.length !== pathSegments.length) {
			const lastPattern = patternSegments[patternSegments.length - 1];
			const isCatchAll = lastPattern?.startsWith('[...') || lastPattern?.startsWith(':...');
			if (!isCatchAll) {
				return null;
			}
		}

		const params: Record<string, string> = {};

		for (let i = 0; i < patternSegments.length; i++) {
			const patternPart = patternSegments[i];
			const pathPart = pathSegments[i];

			if (patternPart.startsWith(':...') || patternPart.startsWith('[...')) {
				const paramName = patternPart.replace(/^(:\.\.\.|\[\.\.\.)/, '').replace(/\]$/, '');
				params[paramName] = pathSegments.slice(i).join('/');
				return params;
			}

			if (patternPart.startsWith(':')) {
				const paramName = patternPart.slice(1);
				params[paramName] = pathPart;
			} else if (patternPart.startsWith('[') && patternPart.endsWith(']')) {
				const paramName = patternPart.slice(1, -1);
				params[paramName] = pathPart;
			} else if (patternPart !== pathPart) {
				return null;
			}
		}

		return params;
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

			const integrationName = view.config?.__eco?.integration;
			if (!integrationName) {
				throw new Error(
					`View at ${route.path} is missing __eco.integration. Ensure it's defined with eco.page() and exported as default.`,
				);
			}

			const renderer = this.routeRendererFactory.getRendererByIntegration(integrationName);
			if (!renderer) {
				throw new Error(`No renderer found for integration: ${integrationName}`);
			}

			const props = view.staticProps
				? (
						await view.staticProps({
							pathname: { params },
							appConfig: this.appConfig,
							runtimeOrigin: this.appConfig.baseUrl,
						})
					).props
				: {};

			return renderer.renderToResponse(view, props, {});
		} catch (error) {
			appLogger.error(
				`Error rendering explicit static route ${route.path}:`,
				error instanceof Error ? error : String(error),
			);
			throw error;
		}
	}
}
