import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { IntegrationPlugin } from '../plugins/integration-plugin.ts';
import type { EcoPageFile, RouteRenderResult, RouteRendererOptions } from '../types/public-types.ts';
import { invariant } from '../utils/invariant.ts';
import { PathUtils } from '../utils/path-utils.module.ts';
import type { IntegrationRenderer, RouteModuleLoadOptions } from './orchestration/integration-renderer.ts';

/**
 * Thin wrapper around one initialized integration renderer.
 *
 * @remarks
 * This type exists so higher-level routing code can ask for a route renderer
 * without depending on the full integration plugin lifecycle. It delegates all
 * real work to the integration-specific renderer selected by the factory.
 */
export class RouteRenderer {
	private renderer: IntegrationRenderer;

	/**
	 * Creates a route renderer bound to one integration renderer instance.
	 */
	constructor(renderer: IntegrationRenderer) {
		this.renderer = renderer;
	}

	/**
	 * Executes the render pipeline for one matched route.
	 */
	async createRoute(options: RouteRendererOptions): Promise<RouteRenderResult> {
		return this.renderer.execute(options);
	}

	/**
	 * Loads the route module through the owning integration renderer.
	 */
	async loadPageModule(filePath: string, options?: RouteModuleLoadOptions): Promise<EcoPageFile> {
		return this.renderer.loadPageModule(filePath, options);
	}
}

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
	createRenderer(filePath: string): RouteRenderer {
		const integrationRenderer = this.getRouteRendererEngine(filePath);
		invariant(!!integrationRenderer, `No integration renderer found for file: ${filePath}`);
		return new RouteRenderer(integrationRenderer);
	}

	/**
	 * Get an integration renderer by its name.
	 * Used for explicit routing where views specify their integration via __eco.integration.
	 */
	getRendererByIntegration(integrationName: string): IntegrationRenderer | null {
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
