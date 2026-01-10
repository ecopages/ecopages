import path from 'node:path';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
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

					const body = await renderer.createRoute({
						file: filePath,
						params,
					});

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
	}: {
		router: FSRouter;
		baseUrl: string;
		routeRendererFactory?: RouteRendererFactory;
	}) {
		this.generateRobotsTxt();
		await this.generateStaticPages(router, baseUrl, routeRendererFactory);
	}
}

function templateSegmentsFromPath(path: string) {
	return path.split('/').filter(Boolean);
}
