import path from 'node:path';
import { availableParallelism } from 'node:os';
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
import { prepareExplicitStaticRender } from '../adapters/shared/explicit-static-render-preparation.ts';
import { createRouteModuleStaticRenderCacheContext } from './static-build-invalidation.ts';
import type { RouteModuleBuildCache } from '../services/module-loading/route-module-build-cache.store.ts';
import {
	getServerModuleBuildCacheOutdir,
	getSharedRouteModuleBuildCache,
} from '../services/module-loading/route-module-build-cache-registry.ts';
import type { StaticExportContext } from './static-export-context.ts';
import { ensurePagesUnifiedGraphBuilt, shouldBuildPagesUnifiedGraph } from '../build/pages-unified-graph-build.ts';

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

function resolveStaticPageConcurrency(): number {
	return Math.max(1, availableParallelism() - 1);
}

async function runWithConcurrency<T>(
	items: readonly T[],
	concurrency: number,
	worker: (item: T) => Promise<void>,
): Promise<void> {
	if (items.length === 0) {
		return;
	}

	const limit = Math.max(1, concurrency);
	let nextIndex = 0;

	const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex++;
			await worker(items[currentIndex]!);
		}
	});

	await Promise.all(runners);
}

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
	private readonly routeModuleBuildCacheOverride?: RouteModuleBuildCache;
	private readonly staticRenderCacheContext: ReturnType<typeof createRouteModuleStaticRenderCacheContext>;
	private forceFullStaticGeneration = false;

	/**
	 * Creates the static-site generator for one app config.
	 */
	constructor({
		appConfig,
		routeModuleBuildCache,
	}: {
		appConfig: EcoPagesAppConfig;
		routeModuleBuildCache?: RouteModuleBuildCache;
	}) {
		this.appConfig = appConfig;
		this.routeModuleBuildCacheOverride = routeModuleBuildCache;
		this.staticRenderCacheContext = createRouteModuleStaticRenderCacheContext(appConfig);
	}

	private getRouteModuleBuildCache(): RouteModuleBuildCache {
		return (
			this.routeModuleBuildCacheOverride ??
			getSharedRouteModuleBuildCache(getServerModuleBuildCacheOutdir(this.appConfig), this.appConfig)
		);
	}

	private getExportDir(): string {
		return this.appConfig.absolutePaths?.distDir ?? path.join(this.appConfig.rootDir, this.appConfig.distDir);
	}

	private async shouldSkipStaticPageFile(
		filePath: string,
		routeRendererFactory: StaticPageRouteRendererFactory,
	): Promise<boolean> {
		const module = (await routeRendererFactory.getPageRenderer(filePath).loadPageModule(filePath)) as {
			default?: EcoPageComponent<any>;
		};

		return module.default?.cache === 'dynamic';
	}

	private shouldSkipStaticView(_routePath: string, view: EcoPageComponent<any>): boolean {
		return view.cache === 'dynamic';
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

	private async writeStaticPageArtifact(options: {
		pathname: string;
		sourceFile?: string;
		directories?: string[];
		createContents: () => Promise<string | Buffer | null>;
		debugLabel?: string;
		reuseRenderedOutput?: boolean;
		activeStaticPathnames?: Set<string>;
	}): Promise<void> {
		options.activeStaticPathnames?.add(options.pathname);

		const directories = options.directories ?? this.getDirectories([options.pathname]);
		const renderedOutputPath = this.getOutputPath(options.pathname, directories);
		const routeModuleBuildCache = this.getRouteModuleBuildCache();

		if (
			options.reuseRenderedOutput !== false &&
			options.sourceFile &&
			routeModuleBuildCache.canReuseStaticRender({
				sourceFile: options.sourceFile,
				pathname: options.pathname,
				renderedOutputPath,
				context: this.staticRenderCacheContext,
				force: this.forceFullStaticGeneration,
			})
		) {
			appLogger.debug(`Skipped unchanged static page: ${options.debugLabel ?? options.pathname}`);
			return;
		}

		const contents = await options.createContents();
		if (contents === null) {
			return;
		}

		const outputPath = this.writeStaticOutput(options.pathname, contents, directories);

		if (options.sourceFile) {
			routeModuleBuildCache.recordStaticRender({
				filePath: options.sourceFile,
				pathname: options.pathname,
				sourceHash: fileSystem.hash(options.sourceFile),
				renderedOutputPath: outputPath,
				context: this.staticRenderCacheContext,
			});
		}
	}

	private pruneStaleStaticOutputs(activeStaticPathnames: ReadonlySet<string>): void {
		const removedOutputPaths = this.getRouteModuleBuildCache().pruneStaleRenderedOutputs(activeStaticPathnames);

		for (const outputPath of removedOutputPaths) {
			const resolvedOutputPath = path.isAbsolute(outputPath) ? outputPath : path.resolve(outputPath);

			if (fileSystem.exists(resolvedOutputPath)) {
				fileSystem.remove(resolvedOutputPath);
				appLogger.debug(`Removed stale static output: ${resolvedOutputPath}`);
			}
		}
	}

	private async createFilesystemStaticContents(
		route: StaticGenerationRoute,
		_baseUrl: string,
		routeRendererFactory?: StaticPageRouteRendererFactory,
		skipped?: string[],
	): Promise<string | Buffer | null> {
		const {
			templateRoute: { filePath },
			params,
		} = route;

		if (!routeRendererFactory) {
			throw new Error(STATIC_SITE_GENERATOR_ERRORS.ROUTE_RENDERER_FACTORY_REQUIRED);
		}

		if (await this.shouldSkipStaticPageFile(filePath, routeRendererFactory)) {
			skipped?.push(filePath);
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
	 * Routes are rendered through the normal route renderer directly.
	 */
	async generateStaticPages(
		router: StaticGenerationRouteSource,
		baseUrl: string,
		routeRendererFactory?: StaticPageRouteRendererFactory,
		skipped?: string[],
		activeStaticPathnames?: Set<string>,
	) {
		const routes = await router.listStaticGenerationRoutes({ runtimeOrigin: baseUrl });

		appLogger.debug(
			'Static Pages',
			routes.map((route) => route.requestUrl),
		);

		const directories = this.getDirectories(routes.map((route) => route.requestUrl));

		await runWithConcurrency(routes, resolveStaticPageConcurrency(), async (route) => {
			try {
				await this.writeStaticPageArtifact({
					pathname: route.pathname,
					sourceFile: route.templateRoute.filePath,
					directories,
					debugLabel: route.requestUrl,
					activeStaticPathnames,
					createContents: () =>
						this.createFilesystemStaticContents(route, baseUrl, routeRendererFactory, skipped),
				});
			} catch (error) {
				appLogger.error(
					`Error generating static page for ${route.requestUrl}:`,
					error instanceof Error ? error : String(error),
				);
			}
		});
	}

	private createStaticExportContext(input: {
		router: StaticGenerationRouteSource;
		baseUrl: string;
		routeRendererFactory?: StaticGenerationRendererFactory;
		staticRoutes?: StaticRoute[];
		force: boolean;
		preserveExportDirectory: boolean;
	}): StaticExportContext {
		return {
			appConfig: this.appConfig,
			router: input.router,
			baseUrl: input.baseUrl,
			routeRendererFactory: input.routeRendererFactory,
			staticRoutes: input.staticRoutes,
			force: input.force,
			preserveExportDirectory: input.preserveExportDirectory,
		};
	}

	private async invokeStaticExportHook(
		hook: 'beforeStaticExport' | 'afterStaticExport',
		context: StaticExportContext,
	): Promise<void> {
		for (const integration of this.appConfig.integrations) {
			const handler = integration[hook];
			if (typeof handler === 'function') {
				await handler.call(integration, context);
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
		force = false,
		preserveExportDirectory = false,
	}: {
		router: StaticGenerationRouteSource;
		baseUrl: string;
		routeRendererFactory?: StaticGenerationRendererFactory;
		staticRoutes?: StaticRoute[];
		force?: boolean;
		preserveExportDirectory?: boolean;
	}) {
		const skippedDynamicPages: string[] = [];
		const activeStaticPathnames = new Set<string>();
		this.forceFullStaticGeneration = force;

		if (!force) {
			this.getRouteModuleBuildCache().ensureIncrementalStaticGenerationContext(this.staticRenderCacheContext);
		}

		if (shouldBuildPagesUnifiedGraph()) {
			const routes = await router.listStaticGenerationRoutes({ runtimeOrigin: baseUrl });
			await ensurePagesUnifiedGraphBuilt({
				appConfig: this.appConfig,
				entryPaths: routes.map((route) => route.templateRoute.filePath),
				outdir: getServerModuleBuildCacheOutdir(this.appConfig),
				force,
			});
		}

		const staticExportContext = this.createStaticExportContext({
			router,
			baseUrl,
			routeRendererFactory,
			staticRoutes,
			force,
			preserveExportDirectory,
		});

		await this.invokeStaticExportHook('beforeStaticExport', staticExportContext);

		try {
			this.generateRobotsTxt();
			await this.generateStaticPages(
				router,
				baseUrl,
				routeRendererFactory,
				skippedDynamicPages,
				activeStaticPathnames,
			);

			if (staticRoutes && staticRoutes.length > 0 && routeRendererFactory) {
				await this.generateExplicitStaticPages(
					staticRoutes,
					routeRendererFactory,
					skippedDynamicPages,
					activeStaticPathnames,
				);
			}

			if (preserveExportDirectory) {
				this.pruneStaleStaticOutputs(activeStaticPathnames);
			}
		} finally {
			await this.invokeStaticExportHook('afterStaticExport', staticExportContext);
		}

		if (skippedDynamicPages.length > 0) {
			appLogger.debug(
				`Skipped ${skippedDynamicPages.length} page(s) with cache: 'dynamic' (not supported in static generation)`,
				skippedDynamicPages,
			);
		}
	}

	/**
	 * Generates static pages from explicit static routes registered via app.static().
	 * These routes use eco.page views via loader functions for HMR support.
	 */
	private async generateExplicitStaticPages(
		staticRoutes: StaticRoute[],
		routeRendererFactory: ExplicitStaticRouteRendererFactory,
		skipped?: string[],
		activeStaticPathnames?: Set<string>,
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
					skipped?.push(route.path);
					continue;
				}

				await this.generateExplicitStaticRoute(route.path, view, routeRendererFactory, activeStaticPathnames);
			} catch (error) {
				appLogger.error(
					`Error generating explicit static page for ${route.path}:`,
					error instanceof Error ? error : String(error),
				);
			}
		}
	}

	private resolveExplicitViewSourceFile(view: EcoPageComponent<any>): string | undefined {
		const sourceFile = view.config?.__eco?.file;
		if (!sourceFile) {
			return undefined;
		}

		return path.isAbsolute(sourceFile) ? sourceFile : path.join(this.appConfig.rootDir, sourceFile);
	}

	private async generateExplicitStaticRoute(
		routePath: string,
		view: EcoPageComponent<any>,
		routeRendererFactory: ExplicitStaticRouteRendererFactory,
		activeStaticPathnames?: Set<string>,
	): Promise<void> {
		const { renderer, routeEntries } = await this.planExplicitStaticRoute(routePath, view, routeRendererFactory);
		const sourceFile = this.resolveExplicitViewSourceFile(view);

		for (const { pathname, params } of routeEntries) {
			await this.writeStaticPageArtifact({
				pathname,
				sourceFile,
				debugLabel: pathname,
				activeStaticPathnames,
				createContents: () =>
					this.createExplicitStaticContents(routePath, view, params, routeRendererFactory, renderer),
			});

			appLogger.debug(`Generated static page: ${pathname}`);
		}
	}

	private async planExplicitStaticRoute(
		routePath: string,
		view: EcoPageComponent<any>,
		routeRendererFactory: ExplicitStaticRouteRendererFactory,
	): Promise<{ renderer: ExplicitViewRenderer; routeEntries: ExplicitStaticRouteEntry[] }> {
		const { renderer } = await prepareExplicitStaticRender({
			routePath,
			view,
			params: {},
			appConfig: this.appConfig,
			runtimeOrigin: this.appConfig.baseUrl,
			routeRendererFactory,
			errors: STATIC_SITE_GENERATOR_ERRORS,
		});

		return {
			renderer,
			routeEntries: await this.listExplicitStaticRouteEntries(routePath, view),
		};
	}

	private async createExplicitStaticContents(
		routePath: string,
		view: EcoPageComponent<any>,
		params: Record<string, string | string[]>,
		routeRendererFactory: ExplicitStaticRouteRendererFactory,
		renderer: ExplicitViewRenderer,
	): Promise<string> {
		const { props, view: renderableView } = await prepareExplicitStaticRender({
			routePath,
			view,
			params,
			appConfig: this.appConfig,
			runtimeOrigin: this.appConfig.baseUrl,
			routeRendererFactory,
			errors: STATIC_SITE_GENERATOR_ERRORS,
		});

		const response = await renderer.renderToResponse(renderableView, props, {});
		return response.text();
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
