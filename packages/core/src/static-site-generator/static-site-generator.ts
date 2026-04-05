import path from 'node:path';
import { DEFAULT_ECOPAGES_WORK_DIR } from '../config/constants.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { EcoPageComponent, StaticRoute } from '../types/public-types.ts';
import type { RouteRendererFactory } from '../route-renderer/route-renderer.ts';
import type { FSRouter } from '../router/server/fs-router.js';
import { fileSystem } from '@ecopages/file-system';
import { PathUtils } from '../utils/path-utils.module.ts';
import { getAppServerModuleTranspiler } from '../services/module-loading/app-server-module-transpiler.service.ts';
import type { ServerModuleTranspiler } from '../services/module-loading/server-module-transpiler.service.ts';

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
	private serverModuleTranspiler: ServerModuleTranspiler;

	/**
	 * Creates the static-site generator for one app config.
	 */
	constructor({ appConfig }: { appConfig: EcoPagesAppConfig }) {
		this.appConfig = appConfig;
		this.serverModuleTranspiler = getAppServerModuleTranspiler(appConfig);
	}

	/**
	 * Returns the transpiler output directory used for static page-module probes.
	 */
	private getStaticPageModuleOutdir(): string {
		const workDir =
			this.appConfig.absolutePaths?.workDir ??
			path.join(this.appConfig.rootDir, this.appConfig.workDir ?? DEFAULT_ECOPAGES_WORK_DIR);
		return path.join(workDir, '.server-static-page-modules');
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
	private async shouldSkipStaticPageFile(filePath: string): Promise<boolean> {
		const module = (await this.serverModuleTranspiler.importModule({
			filePath,
			outdir: this.getStaticPageModuleOutdir(),
			externalPackages: false,
			transpileErrorMessage: (details) => `Error transpiling static page module: ${details}`,
			noOutputMessage: (targetFilePath) =>
				`No transpiled output generated for static page module: ${targetFilePath}`,
		})) as { default?: EcoPageComponent<any> };

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

	/**
	 * Extracts dynamic parameters from the actual path based on the template path.
	 *
	 * @param templatePath - The template path (e.g., "/blog/[slug]")
	 * @param actualPath - The actual path (e.g., "/blog/my-post")
	 * @returns A record of extracted parameters (e.g., { slug: "my-post" })
	 */
	private extractParams(templatePath: string, actualPath: string): Record<string, string> {
		const templateSegments = templateSegmentsFromPath(templatePath);
		const actualSegments = templateSegmentsFromPath(actualPath);
		const params: Record<string, string> = {};

		for (let i = 0; i < templateSegments.length; i++) {
			const segment = templateSegments[i];
			if (segment.startsWith('[') && segment.endsWith(']')) {
				const paramName = segment.slice(1, -1).replace('...', '');
				params[paramName] = actualSegments[i];
			}
		}

		return params;
	}

	/**
	 * Generates static output for all filesystem-discovered routes.
	 *
	 * @remarks
	 * Routes whose integrations opt into fetch-based static builds are rendered by
	 * issuing a request against the running server origin. Render-strategy routes
	 * go through the normal route renderer directly.
	 */
	async generateStaticPages(router: FSRouter, baseUrl: string, routeRendererFactory?: RouteRendererFactory) {
		const routes = Object.keys(router.routes).filter((route) => !route.includes('['));

		appLogger.debug('Static Pages', routes);

		const directories = this.getDirectories(routes);

		for (const directory of directories) {
			fileSystem.ensureDir(path.join(this.getExportDir(), directory));
		}

		for (const route of routes) {
			try {
				const { filePath, pathname: routePathname } = router.routes[route];
				if (await this.shouldSkipStaticPageFile(filePath)) {
					continue;
				}

				const ext = PathUtils.getEcoTemplateExtension(filePath);
				const integration = this.appConfig.integrations.find((plugin) => plugin.extensions.includes(ext));
				const strategy = integration?.staticBuildStep || 'render';

				let contents: string | Buffer;

				if (strategy === 'fetch') {
					const fetchUrl = route.startsWith('http') ? route : `${baseUrl}${route}`;
					const response = await fetch(fetchUrl);

					if (!response.ok) {
						appLogger.error(`Failed to fetch ${fetchUrl}. Status: ${response.status}`);
						continue;
					}
					contents = await response.text();
				} else {
					if (!routeRendererFactory) {
						throw new Error(STATIC_SITE_GENERATOR_ERRORS.ROUTE_RENDERER_FACTORY_REQUIRED);
					}

					let pathname = routePathname;
					const pathnameSegments = pathname.split('/').filter(Boolean);

					if (pathname === '/') {
						pathname = '/index.html';
					} else if (pathnameSegments.join('/').includes('[')) {
						pathname = `${route.replace(router.origin, '')}.html`;
					} else if (pathnameSegments.length >= 1 && directories.includes(`/${pathnameSegments.join('/')}`)) {
						pathname = `${pathname.endsWith('/') ? pathname : `${pathname}/`}index.html`;
					} else {
						pathname += '.html';
					}

					const renderer = routeRendererFactory.createRenderer(filePath);
					const params = this.extractParams(routePathname, pathname.replace('.html', ''));

					const result = await renderer.createRoute({
						file: filePath,
						params,
					});

					const body = result.body;

					if (typeof body === 'string' || Buffer.isBuffer(body)) {
						contents = body;
					} else if (body instanceof ReadableStream) {
						contents = await new Response(body).text();
					} else {
						throw new Error(STATIC_SITE_GENERATOR_ERRORS.unsupportedBodyType(typeof body));
					}
				}

				let pathname = routePathname;
				const pathnameSegments = pathname.split('/').filter(Boolean);

				if (pathname === '/') {
					pathname = '/index.html';
				} else if (pathnameSegments.join('/').includes('[')) {
					pathname = `${route.replace(router.origin, '')}.html`;
				} else if (pathnameSegments.length >= 1 && directories.includes(`/${pathnameSegments.join('/')}`)) {
					pathname = `${pathname.endsWith('/') ? pathname : `${pathname}/`}index.html`;
				} else {
					pathname += '.html';
				}

				const outputPath = path.join(this.getExportDir(), pathname);
				fileSystem.write(outputPath, contents);
			} catch (error) {
				appLogger.error(
					`Error generating static page for ${route}:`,
					error instanceof Error ? error : String(error),
				);
			}
		}
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
		router: FSRouter;
		baseUrl: string;
		routeRendererFactory?: RouteRendererFactory;
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
		routeRendererFactory: RouteRendererFactory,
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

				const isDynamic = route.path.includes(':') || route.path.includes('[');

				if (isDynamic) {
					await this.generateDynamicStaticRoute(route.path, view, routeRendererFactory);
				} else {
					await this.generateSingleStaticRoute(route.path, view, routeRendererFactory);
				}
			} catch (error) {
				appLogger.error(
					`Error generating explicit static page for ${route.path}:`,
					error instanceof Error ? error : String(error),
				);
			}
		}
	}

	/**
	 * Generate a single static page for a non-dynamic route.
	 */
	private async generateSingleStaticRoute(
		routePath: string,
		view: EcoPageComponent<any>,
		routeRendererFactory: RouteRendererFactory,
	): Promise<void> {
		const integrationName = view.config?.__eco?.integration;
		if (!integrationName) {
			throw new Error(STATIC_SITE_GENERATOR_ERRORS.missingIntegration(routePath));
		}

		const renderer = routeRendererFactory.getRendererByIntegration(integrationName);
		if (!renderer) {
			throw new Error(STATIC_SITE_GENERATOR_ERRORS.noRendererForIntegration(integrationName));
		}

		const props = view.staticProps
			? (
					await view.staticProps({
						pathname: { params: {} },
						appConfig: this.appConfig,
						runtimeOrigin: this.appConfig.baseUrl,
					})
				).props
			: {};

		const response = await renderer.renderToResponse(view, props, {});
		const contents = await response.text();

		const outputPath = this.getOutputPath(routePath);
		fileSystem.ensureDir(path.dirname(outputPath));
		fileSystem.write(outputPath, contents);

		appLogger.debug(`Generated static page: ${routePath} -> ${outputPath}`);
	}

	/**
	 * Generate static pages for a dynamic route using staticPaths.
	 */
	private async generateDynamicStaticRoute(
		routePath: string,
		view: EcoPageComponent<any>,
		routeRendererFactory: RouteRendererFactory,
	): Promise<void> {
		if (!view.staticPaths) {
			throw new Error(STATIC_SITE_GENERATOR_ERRORS.dynamicRouteRequiresStaticPaths(routePath));
		}

		const integrationName = view.config?.__eco?.integration;
		if (!integrationName) {
			throw new Error(STATIC_SITE_GENERATOR_ERRORS.missingIntegration(routePath));
		}

		const renderer = routeRendererFactory.getRendererByIntegration(integrationName);
		if (!renderer) {
			throw new Error(STATIC_SITE_GENERATOR_ERRORS.noRendererForIntegration(integrationName));
		}

		const { paths } = await view.staticPaths({
			appConfig: this.appConfig,
			runtimeOrigin: this.appConfig.baseUrl,
		});

		for (const { params } of paths) {
			const resolvedPath = this.resolveRoutePath(routePath, params);

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
			const contents = await response.text();

			const outputPath = this.getOutputPath(resolvedPath);
			fileSystem.ensureDir(path.dirname(outputPath));
			fileSystem.write(outputPath, contents);

			appLogger.debug(`Generated static page: ${resolvedPath} -> ${outputPath}`);
		}
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
	private getOutputPath(routePath: string): string {
		let outputName: string;

		if (routePath === '/') {
			outputName = 'index.html';
		} else if (routePath.endsWith('/')) {
			outputName = `${routePath}index.html`;
		} else {
			outputName = `${routePath}.html`;
		}

		return path.join(this.getExportDir(), outputName);
	}
}

/**
 * Splits a path into segments, filtering out empty strings.
 */
function templateSegmentsFromPath(path: string) {
	return path.split('/').filter(Boolean);
}
