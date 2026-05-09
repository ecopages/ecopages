import path from 'node:path';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { EcoPageComponent, StaticRoute } from '../types/public-types.ts';
import type {
	ExplicitViewRenderer,
	ExplicitViewRendererResolver,
	PageRendererResolver,
	StaticGenerationRendererResolver,
} from '../route-renderer/route-renderer.ts';
import type { StaticGenerationRoute } from '../router/server/route-registry.ts';
import { fileSystem } from '@ecopages/file-system';
import { PathUtils } from '../utils/path-utils.module.ts';

type StaticGenerationRouteSource = {
	listStaticGenerationRoutes(input: { runtimeOrigin: string }): Promise<readonly StaticGenerationRoute[]>;
};

type StaticPageRouteRendererFactory = PageRendererResolver;

type ExplicitStaticRouteRendererFactory = ExplicitViewRendererResolver;

type StaticGenerationRendererFactory = StaticGenerationRendererResolver;

type ExplicitStaticRouteEntry = {
	pathname: string;
	params: Record<string, string | string[]>;
};

export const STATIC_SITE_GENERATOR_ERRORS = {
	ROUTE_RENDERER_FACTORY_REQUIRED: 'RouteRendererFactory is required for render strategy',
	unsupportedBodyType: (bodyType: string) => `Unsupported body type for static generation: ${bodyType}`,
	missingIntegration: (routePath: string) =>
		`View at ${routePath} is missing __eco.integration. Ensure it's defined with eco.page().`,
	noRendererForIntegration: (integrationName: string) => `No renderer found for integration: ${integrationName}`,
	dynamicRouteRequiresStaticPaths: (routePath: string) =>
		`Dynamic route ${routePath} requires staticPaths to be defined on the view.`,
} as const;

/**
 * Generates static output files from the finalized app config and route graph.
 *
 * @remarks
 * This class intentionally reuses the same routing, renderer, and server-module
 * loading seams used by runtime rendering. Static generation should be a build
 * loop over the normal app model, not a parallel rendering stack with different
 * semantics.
 */
export class StaticSiteGenerator {
	appConfig: EcoPagesAppConfig;

	/**
	 * Creates the static-site generator for one app config.
	 */
	constructor({ appConfig }: { appConfig: EcoPagesAppConfig }) {
		this.appConfig = appConfig;
	}

	private getExportDir(): string {
		return this.appConfig.absolutePaths?.distDir ?? path.join(this.appConfig.rootDir, this.appConfig.distDir);
	}

	/**
	 * Logs the standardized warning emitted when a dynamic-cache page is skipped.
	 */
	private warnDynamicPageSkipped(filePath: string): void {
		appLogger.warn(
			"Pages with cache: 'dynamic' are not supported in static generation or preview, so they will be skipped\n",
			`➤ ${filePath}`,
		);
	}

	/**
	 * Determines whether one filesystem-discovered page should be excluded from
	 * static generation.
	 */
	private async shouldSkipStaticPageFile(
		filePath: string,
		routeRendererFactory: StaticPageRouteRendererFactory,
	): Promise<boolean> {
		const module = (await routeRendererFactory.getPageRenderer(filePath).loadPageModule(filePath, {
			cacheScope: 'static-page-probe',
		})) as {
			default?: EcoPageComponent<any>;
		};

		if (module.default?.cache !== 'dynamic') {
			return false;
		}

		this.warnDynamicPageSkipped(filePath);
		return true;
	}

	/**
	 * Determines whether one explicit static route view should be excluded from
	 * static generation.
	 */
	private shouldSkipStaticView(routePath: string, view: EcoPageComponent<any>): boolean {
		if (view.cache !== 'dynamic') {
			return false;
		}

		this.warnDynamicPageSkipped(routePath);
		return true;
	}

	/**
	 * Writes the robots.txt file declared by the app config.
	 */
	generateRobotsTxt(): void {
		let data = '';
		const preferences = this.appConfig.robotsTxt.preferences;

		for (const userAgent in preferences) {
			data += `user-agent: ${userAgent}\n`;
			for (const path of preferences[userAgent]) {
				data += `disallow: ${path}\n`;
			}
			data += '\n';
		}

		fileSystem.ensureDir(this.getExportDir());
		fileSystem.write(path.join(this.getExportDir(), 'robots.txt'), data);
	}

	/**
	 * Returns whether the input path points at the root directory.
	 */
	isRootDir(path: string) {
		const slashes = path.match(/\//g);
		return slashes && slashes.length === 1;
	}

	/**
	 * Collects parent directories that must exist for the generated route set.
	 */
	getDirectories(routes: string[]) {
		const directories = new Set<string>();

		for (const route of routes) {
			const path = route.startsWith('http') ? new URL(route).pathname : route;

			const segments = path.split('/');

			if (segments.length > 2) {
				directories.add(segments.slice(0, segments.length - 1).join('/'));
			}
		}

		return Array.from(directories);
	}

	private writeStaticOutput(routePath: string, contents: string | Buffer, directories: string[] = []): string {
		const outputPath = this.getOutputPath(routePath, directories);
		fileSystem.ensureDir(path.dirname(outputPath));
		fileSystem.write(outputPath, contents);
		return outputPath;
	}

	private getStaticBuildStrategy(filePath: string): 'fetch' | 'render' {
		const ext = PathUtils.getEcoTemplateExtension(filePath);
		const integration = this.appConfig.integrations.find((plugin) => plugin.extensions.includes(ext));
		return integration?.staticBuildStep || 'render';
	}

	private async createFilesystemStaticContents(
		route: StaticGenerationRoute,
		baseUrl: string,
		routeRendererFactory?: StaticPageRouteRendererFactory,
	): Promise<string | Buffer | null> {
		const {
			templateRoute: { filePath },
			params,
		} = route;

		if (this.getStaticBuildStrategy(filePath) === 'fetch') {
			const fetchUrl = this.resolveStaticFetchUrl(route.requestUrl, baseUrl);
			const response = await fetch(fetchUrl);

			if (!response.ok) {
				appLogger.error(`Failed to fetch ${fetchUrl}. Status: ${response.status}`);
				return null;
			}

			return response.text();
		}

		if (!routeRendererFactory) {
			throw new Error(STATIC_SITE_GENERATOR_ERRORS.ROUTE_RENDERER_FACTORY_REQUIRED);
		}

		if (await this.shouldSkipStaticPageFile(filePath, routeRendererFactory)) {
			return null;
		}

		const renderer = routeRendererFactory.getPageRenderer(filePath);
		const result = await renderer.execute({
			file: filePath,
			params: params as Record<string, string>,
		});

		const body = result.body;
		if (typeof body === 'string' || Buffer.isBuffer(body)) {
			return body;
		}

		if (body instanceof ReadableStream) {
			return new Response(body).text();
		}

		throw new Error(STATIC_SITE_GENERATOR_ERRORS.unsupportedBodyType(typeof body));
	}

	/**
	 * Generates static output for all filesystem-discovered routes.
	 *
	 * @remarks
	 * Routes whose integrations opt into fetch-based static builds are rendered by
	 * issuing a request against the running server origin. Render-strategy routes
	 * go through the normal route renderer directly.
	 */
	async generateStaticPages(
		router: StaticGenerationRouteSource,
		baseUrl: string,
		routeRendererFactory?: StaticPageRouteRendererFactory,
	) {
		const routes = await router.listStaticGenerationRoutes({ runtimeOrigin: baseUrl });

		appLogger.debug(
			'Static Pages',
			routes.map((route) => route.requestUrl),
		);

		const directories = this.getDirectories(routes.map((route) => route.requestUrl));

		for (const route of routes) {
			try {
				const contents = await this.createFilesystemStaticContents(route, baseUrl, routeRendererFactory);
				if (contents === null) {
					continue;
				}

				this.writeStaticOutput(route.pathname, contents, directories);
			} catch (error) {
				appLogger.error(
					`Error generating static page for ${route.requestUrl}:`,
					error instanceof Error ? error : String(error),
				);
			}
		}
	}

	private resolveStaticFetchUrl(route: string, baseUrl: string): string {
		if (!route.startsWith('http://') && !route.startsWith('https://')) {
			return `${baseUrl}${route}`;
		}

		const targetUrl = new URL(route);
		const buildUrl = new URL(baseUrl);
		buildUrl.pathname = targetUrl.pathname;
		buildUrl.search = targetUrl.search;
		buildUrl.hash = targetUrl.hash;

		return buildUrl.href;
	}

	/**
	 * Executes the full static-generation workflow for one app run.
	 */
	async run({
		router,
		baseUrl,
		routeRendererFactory,
		staticRoutes,
	}: {
		router: StaticGenerationRouteSource;
		baseUrl: string;
		routeRendererFactory?: StaticGenerationRendererFactory;
		staticRoutes?: StaticRoute[];
	}) {
		this.generateRobotsTxt();
		await this.generateStaticPages(router, baseUrl, routeRendererFactory);

		if (staticRoutes && staticRoutes.length > 0 && routeRendererFactory) {
			await this.generateExplicitStaticPages(staticRoutes, routeRendererFactory);
		}
	}

	/**
	 * Generates static pages from explicit static routes registered via app.static().
	 * These routes use eco.page views via loader functions for HMR support.
	 */
	private async generateExplicitStaticPages(
		staticRoutes: StaticRoute[],
		routeRendererFactory: ExplicitStaticRouteRendererFactory,
	): Promise<void> {
		appLogger.debug(
			'Generating explicit static routes',
			staticRoutes.map((r) => r.path),
		);

		for (const route of staticRoutes) {
			try {
				const mod = await route.loader();
				const view = mod.default;
				if (this.shouldSkipStaticView(route.path, view)) {
					continue;
				}

				await this.generateExplicitStaticRoute(route.path, view, routeRendererFactory);
			} catch (error) {
				appLogger.error(
					`Error generating explicit static page for ${route.path}:`,
					error instanceof Error ? error : String(error),
				);
			}
		}
	}

	private async generateExplicitStaticRoute(
		routePath: string,
		view: EcoPageComponent<any>,
		routeRendererFactory: ExplicitStaticRouteRendererFactory,
	): Promise<void> {
		const { renderer, routeEntries } = await this.planExplicitStaticRoute(routePath, view, routeRendererFactory);

		for (const { pathname, params } of routeEntries) {
			const contents = await this.createExplicitStaticContents(view, params, renderer);

			const outputPath = this.writeStaticOutput(pathname, contents);

			appLogger.debug(`Generated static page: ${pathname} -> ${outputPath}`);
		}
	}

	private async planExplicitStaticRoute(
		routePath: string,
		view: EcoPageComponent<any>,
		routeRendererFactory: ExplicitStaticRouteRendererFactory,
	): Promise<{ renderer: ExplicitViewRenderer; routeEntries: ExplicitStaticRouteEntry[] }> {
		return {
			renderer: this.getExplicitStaticRenderer(routePath, view, routeRendererFactory),
			routeEntries: await this.listExplicitStaticRouteEntries(routePath, view),
		};
	}

	private async createExplicitStaticContents(
		view: EcoPageComponent<any>,
		params: Record<string, string | string[]>,
		renderer: ExplicitViewRenderer,
	): Promise<string> {
		const props = view.staticProps
			? (
					await view.staticProps({
						pathname: { params },
						appConfig: this.appConfig,
						runtimeOrigin: this.appConfig.baseUrl,
					})
				).props
			: {};

		const response = await renderer.renderToResponse(view, props, {});
		return response.text();
	}

	private getExplicitStaticRenderer(
		routePath: string,
		view: EcoPageComponent<any>,
		routeRendererFactory: ExplicitStaticRouteRendererFactory,
	) {
		const integrationName = view.config?.__eco?.integration;
		if (!integrationName) {
			throw new Error(STATIC_SITE_GENERATOR_ERRORS.missingIntegration(routePath));
		}

		const renderer = routeRendererFactory.getExplicitViewRenderer(integrationName);
		if (!renderer) {
			throw new Error(STATIC_SITE_GENERATOR_ERRORS.noRendererForIntegration(integrationName));
		}

		return renderer;
	}

	private async listExplicitStaticRouteEntries(
		routePath: string,
		view: EcoPageComponent<any>,
	): Promise<ExplicitStaticRouteEntry[]> {
		const isDynamic = routePath.includes(':') || routePath.includes('[');
		if (!isDynamic) {
			return [{ pathname: routePath, params: {} }];
		}

		if (!view.staticPaths) {
			throw new Error(STATIC_SITE_GENERATOR_ERRORS.dynamicRouteRequiresStaticPaths(routePath));
		}

		const { paths } = await view.staticPaths({
			appConfig: this.appConfig,
			runtimeOrigin: this.appConfig.baseUrl,
		});

		return paths.map(({ params }) => ({
			pathname: this.resolveRoutePath(routePath, params),
			params,
		}));
	}

	/**
	 * Resolve a route path template with actual params.
	 * Supports both :param and [param] syntax.
	 */
	private resolveRoutePath(routePath: string, params: Record<string, string | string[]>): string {
		let resolved = routePath;

		for (const [key, value] of Object.entries(params)) {
			const paramValue = Array.isArray(value) ? value.join('/') : value;
			resolved = resolved.replace(`:${key}`, paramValue);
			resolved = resolved.replace(`[${key}]`, paramValue);
			resolved = resolved.replace(`[...${key}]`, paramValue);
		}

		return resolved;
	}

	/**
	 * Get the output file path for a given route.
	 */
	private getOutputPath(routePath: string, directories: string[] = []): string {
		let outputName: string;

		if (routePath === '/') {
			outputName = 'index.html';
		} else if (directories.includes(routePath)) {
			outputName = `${routePath}/index.html`;
		} else if (routePath.endsWith('/')) {
			outputName = `${routePath}index.html`;
		} else {
			outputName = `${routePath}.html`;
		}

		return path.join(this.getExportDir(), outputName);
	}
}
