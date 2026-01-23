import path from 'node:path';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { StaticRoute } from '../public-types.ts';
import type { RouteRendererFactory } from '../route-renderer/route-renderer.ts';
import type { FSRouter } from '../router/fs-router.ts';
import { fileSystem } from '@ecopages/file-system';
import { PathUtils } from '../utils/path-utils.module.ts';

export class StaticSiteGenerator {
	appConfig: EcoPagesAppConfig;

	constructor({ appConfig }: { appConfig: EcoPagesAppConfig }) {
		this.appConfig = appConfig;
	}

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

		fileSystem.ensureDir(this.appConfig.distDir);
		fileSystem.write(`${this.appConfig.distDir}/robots.txt`, data);
	}

	isRootDir(path: string) {
		const slashes = path.match(/\//g);
		return slashes && slashes.length === 1;
	}

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

	async generateStaticPages(router: FSRouter, baseUrl: string, routeRendererFactory?: RouteRendererFactory) {
		const routes = Object.keys(router.routes).filter((route) => !route.includes('['));

		appLogger.debug('Static Pages', routes);

		const directories = this.getDirectories(routes);

		for (const directory of directories) {
			fileSystem.ensureDir(path.join(this.appConfig.rootDir, this.appConfig.distDir, directory));
		}

		for (const route of routes) {
			try {
				const { filePath, pathname: routePathname } = router.routes[route];
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
						throw new Error('RouteRendererFactory is required for render strategy');
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
						contents = await Bun.readableStreamToText(body);
					} else {
						throw new Error(`Unsupported body type for static generation: ${typeof body}`);
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

				const outputPath = path.join(this.appConfig.rootDir, this.appConfig.distDir, pathname);
				fileSystem.write(outputPath, contents);
			} catch (error) {
				appLogger.error(
					`Error generating static page for ${route}:`,
					error instanceof Error ? error : String(error),
				);
			}
		}
	}

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
	 * These routes use eco.page views directly instead of file-system routing.
	 */
	private async generateExplicitStaticPages(
		staticRoutes: StaticRoute[],
		routeRendererFactory: RouteRendererFactory,
	): Promise<void> {
		appLogger.debug(
			'Generating explicit static routes',
			staticRoutes.map((r) => r.path),
		);

		for (const { path: routePath, view } of staticRoutes) {
			try {
				const isDynamic = routePath.includes(':') || routePath.includes('[');

				if (isDynamic) {
					await this.generateDynamicStaticRoute(routePath, view, routeRendererFactory);
				} else {
					await this.generateSingleStaticRoute(routePath, view, routeRendererFactory);
				}
			} catch (error) {
				appLogger.error(
					`Error generating explicit static page for ${routePath}:`,
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
		view: StaticRoute['view'],
		routeRendererFactory: RouteRendererFactory,
	): Promise<void> {
		const integrationName = view.config?.__eco?.integration;
		if (!integrationName) {
			throw new Error(`View at ${routePath} is missing __eco.integration. Ensure it's defined with eco.page().`);
		}

		const renderer = routeRendererFactory.getRendererByIntegration(integrationName);
		if (!renderer) {
			throw new Error(`No renderer found for integration: ${integrationName}`);
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
		view: StaticRoute['view'],
		routeRendererFactory: RouteRendererFactory,
	): Promise<void> {
		if (!view.staticPaths) {
			throw new Error(`Dynamic route ${routePath} requires staticPaths to be defined on the view.`);
		}

		const integrationName = view.config?.__eco?.integration;
		if (!integrationName) {
			throw new Error(`View at ${routePath} is missing __eco.integration. Ensure it's defined with eco.page().`);
		}

		const renderer = routeRendererFactory.getRendererByIntegration(integrationName);
		if (!renderer) {
			throw new Error(`No renderer found for integration: ${integrationName}`);
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

		return path.join(this.appConfig.rootDir, this.appConfig.distDir, outputName);
	}
}

/**
 * Splits a path into segments, filtering out empty strings.
 */
function templateSegmentsFromPath(path: string) {
	return path.split('/').filter(Boolean);
}
