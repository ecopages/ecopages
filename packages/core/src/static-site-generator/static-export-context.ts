import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { EcopagesRouteInfo, StaticRoute } from '../types/public-types.ts';
import type { StaticGenerationRendererResolver } from '../route-renderer/route-renderer.ts';
import type { StaticGenerationRoute } from '../router/server/route-registry.ts';

type StaticGenerationRouteSource = {
	listStaticGenerationRoutes(input: { runtimeOrigin: string }): Promise<readonly StaticGenerationRoute[]>;
};

/**
 * Context passed to integration plugins during static export lifecycle hooks.
 */
export interface StaticExportContext {
	appConfig: EcoPagesAppConfig;
	router: StaticGenerationRouteSource;
	baseUrl: string;
	routeRendererFactory?: StaticGenerationRendererResolver;
	staticRoutes?: StaticRoute[];
	force: boolean;
	preserveExportDirectory: boolean;
	/**
	 * Unfiltered static-generation routes (exact + expanded dynamic).
	 *
	 * @remarks
	 * Sitemap filtering is applied separately; integrations that build custom
	 * artifacts should start from this full list.
	 */
	routes: EcopagesRouteInfo[];
}
