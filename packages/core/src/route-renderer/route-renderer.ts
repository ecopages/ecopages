import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { IntegrationPlugin } from '../plugins/integration-plugin.ts';
import { invariant } from '../utils/invariant.ts';
import { PathUtils } from '../utils/path-utils.module.ts';
import type { IntegrationRenderer } from './orchestration/integration-renderer.ts';

/**
 * Narrow route-render contract exposed to higher-level routing code.
 *
 * @remarks
 * Higher-level routing code only needs request execution and page-module
 * loading. Returning this narrowed shape avoids a dedicated wrapper class while
 * still keeping callers off the full integration renderer surface.
 */
export type PageRouteRenderer = Pick<IntegrationRenderer, 'execute' | 'loadPageModule'>;

/**
 * Narrow explicit-view render contract exposed to static route handling.
 *
 * @remarks
 * Explicit static routes only need `renderToResponse()`, so the factory can
 * hide the broader integration renderer surface there as well.
 */
export type ExplicitViewRenderer = Pick<IntegrationRenderer, 'renderToResponse'>;

export interface PageRendererResolver {
	getPageRenderer(filePath: string): PageRouteRenderer;
}

export interface ExplicitViewRendererResolver {
	getExplicitViewRenderer(integrationName: string): ExplicitViewRenderer | null;
}

/**
 * Combined renderer-factory contract used by static generation.
 */
export type StaticGenerationRendererResolver = PageRendererResolver & ExplicitViewRendererResolver;

/**
 * Selects and caches integration renderers for route files and explicit views.
 *
 * @remarks
 * The factory owns the policy that maps a route file or explicit integration
 * name to one initialized integration renderer. Renderer instances are cached by
 * integration name so repeated requests do not rebuild renderer state.
 */
export class RouteRendererFactory {
	private appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
	private rendererModules?: unknown;
	private rendererCache = new Map<string, IntegrationRenderer>();

	/**
	 * Creates the route-renderer factory for one app/runtime instance.
	 */
	constructor({
		appConfig,
		rendererModules,
		runtimeOrigin,
	}: {
		appConfig: EcoPagesAppConfig;
		rendererModules?: unknown;
		runtimeOrigin: string;
	}) {
		this.appConfig = appConfig;
		this.rendererModules = rendererModules;
		this.runtimeOrigin = runtimeOrigin;
	}

	/**
	 * Returns a route renderer for the supplied route file.
	 */
	getPageRenderer(filePath: string): PageRouteRenderer {
		const integrationRenderer = this.getRouteRendererEngine(filePath);
		invariant(!!integrationRenderer, `No integration renderer found for file: ${filePath}`);
		return integrationRenderer;
	}

	/**
	 * Returns a renderer for an explicit view integration.
	 */
	getExplicitViewRenderer(integrationName: string): ExplicitViewRenderer | null {
		const integrationPlugin = this.appConfig.integrations.find((plugin) => plugin.name === integrationName);
		if (!integrationPlugin) {
			return null;
		}

		const cached = this.rendererCache.get(integrationName);
		if (cached) {
			return cached;
		}

		const renderer = integrationPlugin.initializeRenderer({
			rendererModules: this.rendererModules,
		});
		this.rendererCache.set(integrationName, renderer);
		return renderer;
	}

	/**
	 * Resolves the integration plugin that owns a given route file.
	 */
	getIntegrationPlugin(filePath: string): IntegrationPlugin {
		const templateExtension = PathUtils.getEcoTemplateExtension(filePath);
		const isIntegrationPlugin = (plugin: IntegrationPlugin): boolean => {
			return plugin.extensions.some((extension) => templateExtension === extension);
		};
		const integrationPlugin = this.appConfig.integrations.find(isIntegrationPlugin);
		invariant(
			!!integrationPlugin,
			`No integration plugin found for template extension: ${templateExtension}, file: ${filePath}`,
		);
		return integrationPlugin as IntegrationPlugin;
	}

	/**
	 * Returns the cached renderer engine for the file's owning integration,
	 * creating it on first use.
	 */
	private getRouteRendererEngine(filePath: string): IntegrationRenderer {
		const integrationPlugin = this.getIntegrationPlugin(filePath);
		const cached = this.rendererCache.get(integrationPlugin.name);
		if (cached) {
			return cached;
		}

		const renderer = integrationPlugin.initializeRenderer({
			rendererModules: this.rendererModules,
		});
		this.rendererCache.set(integrationPlugin.name, renderer);
		return renderer;
	}
}
