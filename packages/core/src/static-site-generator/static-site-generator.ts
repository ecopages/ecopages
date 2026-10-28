import path from 'node:path';
import { appLogger } from '../global/app-logger.ts';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import { resolveBuildParallelism } from '../build/build-parallelism.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import type {
	EcoPageComponent,
	EcoPageFile,
	EcopagesRouteInfo,
	PageMetadataProps,
	SitemapConfig,
	StaticRoute,
	ErrorPageLoaders,
} from '../types/contracts.ts';
import type {
	ExplicitViewRenderer,
	ExplicitViewRendererResolver,
	PageRendererResolver,
	StaticGenerationRendererResolver,
} from '../route-renderer/route-renderer.ts';
import type { PathExpansion, StaticGenerationRoute, TemplateRoute } from '../router/server/route-registry.ts';
import { fileSystem } from '@ecopages/file-system';
import { CLIENT_OUTPUT_DIR } from '../utils/resolve-entry-file.ts';
import {
	prepareExplicitStaticRender,
	resolveExplicitViewRenderer,
} from '../route-renderer/explicit-view-render-preparation.ts';
import type { StaticExportContext, StaticExportRelease } from './static-export-context.ts';
import {
	ensureIntegrationRuntimeReady,
	setupAppRuntimeIntegrations,
	teardownAppRuntimeIntegrations,
} from '../build/app-build-manifest-runtime.ts';
import { emitProductionServerModules, shouldBuildPagesUnifiedGraph } from '../build/cache/pages-unified-graph-build.ts';
import {
	clearProductionPageBrowserGraphSession,
	prebuildProductionPageBrowserGraphs,
	shouldPrebuildProductionPageBrowserGraphs,
} from './production-page-browser-graph-prebuild.ts';
import { renderSitemap } from './sitemap.ts';
import { resolveSitemapLocations } from './sitemap-routes.ts';
import { toEcopagesRouteInfo } from '../utils/ecopages-route-info.ts';
import { buildSegmentPath } from '../router/server/segment-path-matcher.ts';
import { normalizePathname } from '../utils/path-pattern.ts';
import { ErrorPageRenderer } from '../route-renderer/error-pages/error-page-renderer.ts';
import {
	SemanticErrorPageExporter,
	SEMANTIC_ERROR_PAGE_PATHNAMES,
} from '../route-renderer/error-pages/semantic-error-page-exporter.ts';

type StaticGenerationRouteSource = {
	listStaticGenerationRoutes(input: { runtimeOrigin: string }): Promise<readonly StaticGenerationRoute[]>;
	listDynamicPagePathExpansions?(input: { runtimeOrigin: string }): Promise<readonly PathExpansion[]>;
	templateRoutes?: readonly TemplateRoute[];
};

type StaticPageRouteRendererFactory = PageRendererResolver;

type ExplicitStaticRouteRendererFactory = ExplicitViewRendererResolver;

type StaticGenerationRendererFactory = StaticGenerationRendererResolver;

/**
 * @remarks
 * Static generation stores pages with route-specific props before the renderer prepares each route. The props type is
 * intentionally erased here; rendering remains responsible for interpreting that page's props.
 */
type StaticGenerationPage = EcoPageComponent<any>;

type ExplicitStaticRouteEntry = {
	pathname: string;
	params: Record<string, string | string[]>;
};

type PreparedExplicitStaticRoute = {
	routePath: string;
	routeFile?: string;
	view: StaticGenerationPage;
	renderer: ExplicitViewRenderer;
	routeEntries: ExplicitStaticRouteEntry[];
};

function createStaticGenerationPageError(route: string, error: unknown, label = 'static page'): Error {
	const cause = error instanceof Error ? error : new Error(String(error));
	appLogger.error(`Error generating ${label} for ${route}:`, cause);
	return new Error(`Failed to generate ${label} for ${route}`, { cause });
}

function throwStaticGenerationPageFailures(pageFailures: Error[], keepGoing: boolean): void {
	if (!keepGoing && pageFailures.length > 0) {
		throw new AggregateError(pageFailures, `Failed to generate ${pageFailures.length} static page(s)`);
	}
}

function clearProductionBrowserManifestOnFailure(appConfig: EcoPagesAppConfig, generationFailed: boolean): void {
	if (generationFailed && shouldPrebuildProductionPageBrowserGraphs()) {
		clearProductionPageBrowserGraphSession(appConfig);
	}
}

export const STATIC_SITE_GENERATOR_ERRORS = {
	ROUTE_RENDERER_FACTORY_REQUIRED: 'RouteRendererFactory is required for render strategy',
	unsupportedBodyType: (bodyType: string) => `Unsupported body type for static generation: ${bodyType}`,
	missingIntegration: (routePath: string) =>
		`View at ${routePath} is missing component identity integration. Ensure it's defined with eco.page().`,
	noRendererForIntegration: (integrationName: string) => `No renderer found for integration: ${integrationName}`,
	dynamicRouteRequiresStaticPaths: (routePath: string) =>
		`Dynamic route ${routePath} requires staticPaths to be defined on the view.`,
} as const;

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

	/**
	 * Creates the static-site generator for one app config.
	 */
	constructor({ appConfig }: { appConfig: EcoPagesAppConfig }) {
		this.appConfig = appConfig;
	}

	private getExportDir(): string {
		return (
			this.appConfig.absolutePaths?.distDir ??
			path.join(this.appConfig.rootDir, this.appConfig.distDir, CLIENT_OUTPUT_DIR)
		);
	}

	private async shouldSkipStaticPageFile(
		filePath: string,
		params: Record<string, string | string[]>,
		routeRendererFactory: StaticPageRouteRendererFactory,
	): Promise<boolean> {
		const renderer = routeRendererFactory.getPageRenderer(filePath);
		const pageModule: EcoPageFile = await renderer.loadPageModule(filePath);
		const Page = pageModule.default as StaticGenerationPage;
		if (Page.cache !== 'dynamic') {
			return false;
		}

		renderer.clearPrebuiltRoutePreparation?.({ file: filePath, params });
		return true;
	}

	private shouldSkipStaticView(_routePath: string, view: StaticGenerationPage): boolean {
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
	 * Writes the configured sitemap file to the export directory.
	 */
	generateSitemap(locations: readonly string[], sitemap: SitemapConfig): void {
		const fileName = sitemap.fileName ?? 'sitemap.xml';
		fileSystem.ensureDir(this.getExportDir());
		fileSystem.write(path.join(this.getExportDir(), fileName), renderSitemap(locations));
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
		directories?: string[];
		createContents: () => Promise<string | Buffer | null>;
		activeStaticPathnames?: Set<string>;
		onSuccessfulExport?: () => Promise<void>;
	}): Promise<void> {
		const directories = options.directories ?? this.getDirectories([options.pathname]);
		const contents = await options.createContents();
		if (contents === null) {
			return;
		}

		this.writeStaticOutput(options.pathname, contents, directories);
		options.activeStaticPathnames?.add(options.pathname);
		await options.onSuccessfulExport?.();
	}

	/**
	 * Marks a successfully exported pathname as sitemap-eligible when robots allow indexing.
	 *
	 * @remarks
	 * Fail-closed: metadata resolution errors omit the URL. `robots.index === false`
	 * also omits it. Eligibility is decided during generation, not by reloading modules
	 * after the pages are written.
	 */
	private async considerSitemapEligibility(input: {
		pathname: string;
		sitemapEligiblePathnames?: Set<string>;
		resolveMetadata: () => Promise<PageMetadataProps>;
	}): Promise<void> {
		if (!input.sitemapEligiblePathnames || !this.appConfig.sitemap?.enabled) {
			return;
		}

		try {
			const metadata = await input.resolveMetadata();
			if (metadata.robots?.index === false) {
				return;
			}
			input.sitemapEligiblePathnames.add(normalizePathname(input.pathname));
		} catch (error) {
			appLogger.debug(
				`Sitemap eligibility skipped for ${input.pathname}; metadata resolution failed`,
				error instanceof Error ? (error.stack ?? error.message) : String(error),
			);
		}
	}

	private async createFilesystemStaticContents(input: {
		route: StaticGenerationRoute;
		routeRendererFactory?: StaticPageRouteRendererFactory;
		skipped?: string[];
	}): Promise<{ body: string | Buffer; metadata?: PageMetadataProps } | null> {
		const {
			route: {
				templateRoute: { filePath },
				params,
			},
			routeRendererFactory,
			skipped,
		} = input;

		if (!routeRendererFactory) {
			throw new Error(STATIC_SITE_GENERATOR_ERRORS.ROUTE_RENDERER_FACTORY_REQUIRED);
		}

		if (await this.shouldSkipStaticPageFile(filePath, params, routeRendererFactory)) {
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
			return { body, metadata: result.metadata };
		}

		if (body instanceof ReadableStream) {
			return { body: await new Response(body).text(), metadata: result.metadata };
		}

		throw new Error(STATIC_SITE_GENERATOR_ERRORS.unsupportedBodyType(typeof body));
	}

	/**
	 * Generates static output for all filesystem-discovered routes.
	 *
	 * @remarks
	 * Routes are rendered through the normal route renderer directly.
	 */
	async generateStaticPages(input: {
		router: StaticGenerationRouteSource;
		baseUrl: string;
		routeRendererFactory?: StaticPageRouteRendererFactory;
		skipped?: string[];
		failures?: Error[];
		activeStaticPathnames?: Set<string>;
		preloadedRoutes?: readonly StaticGenerationRoute[];
		sitemapEligiblePathnames?: Set<string>;
	}) {
		const { router, baseUrl, routeRendererFactory, skipped, activeStaticPathnames, sitemapEligiblePathnames } =
			input;
		const routes = input.preloadedRoutes ?? (await router.listStaticGenerationRoutes({ runtimeOrigin: baseUrl }));

		appLogger.debug(
			'Static Pages',
			routes.map((route) => route.requestUrl),
		);

		const directories = this.getDirectories(routes.map((route) => route.requestUrl));
		const failures = input.failures ?? [];

		await runWithConcurrency(routes, resolveBuildParallelism(), async (route) => {
			try {
				let renderedMetadata: PageMetadataProps | undefined;
				await this.writeStaticPageArtifact({
					pathname: route.pathname,
					directories,
					activeStaticPathnames,
					onSuccessfulExport: () =>
						this.considerSitemapEligibility({
							pathname: route.pathname,
							sitemapEligiblePathnames,
							resolveMetadata: async () => {
								if (!renderedMetadata) {
									throw new Error(`No metadata was rendered for ${route.pathname}`);
								}
								return renderedMetadata;
							},
						}),
					createContents: async () => {
						const rendered = await this.createFilesystemStaticContents({
							route,
							routeRendererFactory,
							skipped,
						});
						renderedMetadata = rendered?.metadata;
						return rendered?.body ?? null;
					},
				});
			} catch (error) {
				failures.push(createStaticGenerationPageError(route.requestUrl, error));
			}
		});

		if (!input.failures && failures.length > 0) {
			throw new AggregateError(failures, `Failed to generate ${failures.length} static page(s)`);
		}
	}

	private createStaticExportContext(input: {
		router: StaticGenerationRouteSource;
		baseUrl: string;
		routeRendererFactory?: StaticGenerationRendererFactory;
		staticRoutes?: StaticRoute[];
		force: boolean;
		routes: EcopagesRouteInfo[];
	}): StaticExportContext {
		return {
			appConfig: this.appConfig,
			router: input.router,
			baseUrl: input.baseUrl,
			routeRendererFactory: input.routeRendererFactory,
			staticRoutes: input.staticRoutes,
			force: input.force,
			routes: input.routes,
		};
	}

	private async startStaticExports(context: StaticExportContext): Promise<StaticExportRelease[]> {
		const releases: StaticExportRelease[] = [];
		try {
			for (const integration of this.appConfig.integrations) {
				if (!integration.staticExport) continue;
				await ensureIntegrationRuntimeReady({
					appConfig: this.appConfig,
					integrationName: integration.name,
				});
				const release = await integration.staticExport(context);
				if (release) {
					releases.push(release);
				}
			}
		} catch (error) {
			await this.releaseStaticExports(releases);
			throw error;
		}
		return releases;
	}

	private async releaseStaticExports(releases: readonly StaticExportRelease[]): Promise<void> {
		for (const release of [...releases].reverse()) {
			try {
				await release();
			} catch (error) {
				appLogger.error(
					'Failed to release an Integration after static export:',
					error instanceof Error ? error : new Error(String(error)),
				);
			}
		}
	}

	private resetStaticGenerationState(force: boolean): void {
		if (shouldPrebuildProductionPageBrowserGraphs() && force) {
			clearProductionPageBrowserGraphSession(this.appConfig);
		}
	}

	/**
	 * @remarks
	 * An empty `templateRoutes` array still emits explicit views, the Html shell,
	 * Layouts, and error pages. When the route source omits `templateRoutes`,
	 * listed Pages are used instead.
	 */
	private async emitProductionServerModulesForStaticGeneration(input: {
		router: StaticGenerationRouteSource;
		listedTemplateRoutes: readonly { filePath: string }[];
		staticRoutes?: StaticRoute[];
		errorPageLoaders?: ErrorPageLoaders;
	}): Promise<void> {
		if (requireAppRuntime(this.appConfig).productionServerModules || !shouldBuildPagesUnifiedGraph()) {
			return;
		}
		await emitProductionServerModules({
			appConfig: this.appConfig,
			router: { templateRoutes: input.router.templateRoutes ?? input.listedTemplateRoutes },
			staticRoutes: input.staticRoutes,
			errorPageLoaders: input.errorPageLoaders,
		});
	}

	private async executeStaticGenerationBody(input: {
		router: StaticGenerationRouteSource;
		baseUrl: string;
		routeRendererFactory?: StaticGenerationRendererFactory;
		staticRoutes?: StaticRoute[];
		errorPageLoaders?: ErrorPageLoaders;
		routes: readonly StaticGenerationRoute[];
		skippedDynamicPages: string[];
		pageFailures: Error[];
		activeStaticPathnames: Set<string>;
		sitemapEligiblePathnames?: Set<string>;
	}): Promise<void> {
		const explicitStaticRoutes =
			input.staticRoutes && input.routeRendererFactory
				? await this.prepareExplicitStaticRoutes({
						staticRoutes: input.staticRoutes,
						routeRendererFactory: input.routeRendererFactory,
						skipped: input.skippedDynamicPages,
						failures: input.pageFailures,
					})
				: [];

		if (shouldPrebuildProductionPageBrowserGraphs() && input.routeRendererFactory) {
			const dynamicRouteTemplates = (input.router.templateRoutes ?? [])
				.filter((route) => route.kind !== 'exact' && route.role === 'page')
				.map((route) => ({ routeFile: route.filePath, skipStaticProps: true, isRouteTemplate: true }));
			const dynamicPageEntries =
				(await input.router.listDynamicPagePathExpansions?.({
					runtimeOrigin: input.baseUrl,
				})) ?? [];
			await prebuildProductionPageBrowserGraphs(
				this.appConfig,
				[
					...input.routes.map((route) => ({
						routeFile: route.templateRoute.filePath,
						params: route.params,
					})),
					...dynamicPageEntries.map((route) => ({
						routeFile: route.templateRoute.filePath,
						params: route.params,
					})),
					...dynamicRouteTemplates,
					...explicitStaticRoutes.flatMap(({ routeFile, routeEntries }) =>
						routeFile ? routeEntries.map(({ params }) => ({ routeFile, params })) : [],
					),
				],
				input.routeRendererFactory,
			);
		}

		this.generateRobotsTxt();
		const semanticErrorPathnames = new Set<string>(SEMANTIC_ERROR_PAGE_PATHNAMES);
		const pageRoutes = input.routes.filter((route) => !semanticErrorPathnames.has(route.pathname));
		await this.generateStaticPages({
			router: input.router,
			baseUrl: input.baseUrl,
			routeRendererFactory: input.routeRendererFactory,
			skipped: input.skippedDynamicPages,
			failures: input.pageFailures,
			activeStaticPathnames: input.activeStaticPathnames,
			preloadedRoutes: pageRoutes,
			sitemapEligiblePathnames: input.sitemapEligiblePathnames,
		});

		if (explicitStaticRoutes.length > 0 && input.routeRendererFactory) {
			await this.generateExplicitStaticPages({
				staticRoutes: explicitStaticRoutes,
				routeRendererFactory: input.routeRendererFactory,
				failures: input.pageFailures,
				activeStaticPathnames: input.activeStaticPathnames,
				sitemapEligiblePathnames: input.sitemapEligiblePathnames,
			});
		}

		const errorPageRenderer = new ErrorPageRenderer({
			appConfig: this.appConfig,
			routeRendererFactory: input.routeRendererFactory,
			errorPageLoaders: input.errorPageLoaders,
		});
		await new SemanticErrorPageExporter({
			errorPageRenderer,
			writeArtifact: async (artifact) => await this.writeStaticPageArtifact(artifact),
		}).export(input.activeStaticPathnames);
	}

	private finalizeStaticGenerationRun(input: {
		baseUrl: string;
		skippedDynamicPages: string[];
		sitemapEligiblePathnames?: Set<string>;
	}): void {
		if (this.appConfig.sitemap?.enabled && input.sitemapEligiblePathnames) {
			const locations = resolveSitemapLocations({
				eligiblePathnames: [...input.sitemapEligiblePathnames],
				sitemap: this.appConfig.sitemap,
				baseUrl: input.baseUrl,
			});
			this.generateSitemap(locations, this.appConfig.sitemap);
		}

		if (input.skippedDynamicPages.length > 0) {
			appLogger.debug(
				`Skipped ${input.skippedDynamicPages.length} page(s) with cache: 'dynamic' (not supported in static generation)`,
				input.skippedDynamicPages,
			);
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
		errorPageLoaders,
		force = false,
		keepGoing = false,
	}: {
		router: StaticGenerationRouteSource;
		baseUrl: string;
		routeRendererFactory?: StaticGenerationRendererFactory;
		staticRoutes?: StaticRoute[];
		errorPageLoaders?: ErrorPageLoaders;
		force?: boolean;
		keepGoing?: boolean;
	}) {
		const skippedDynamicPages: string[] = [];
		const pageFailures: Error[] = [];
		const activeStaticPathnames = new Set<string>();
		const sitemapEligiblePathnames = this.appConfig.sitemap?.enabled ? new Set<string>() : undefined;
		this.resetStaticGenerationState(force);

		let releases: StaticExportRelease[] = [];
		let generationFailed = false;
		let generationError: unknown;
		try {
			await setupAppRuntimeIntegrations({ appConfig: this.appConfig });
			const routes = await router.listStaticGenerationRoutes({ runtimeOrigin: baseUrl });
			await this.emitProductionServerModulesForStaticGeneration({
				router,
				listedTemplateRoutes: routes.map((route) => route.templateRoute),
				staticRoutes,
				errorPageLoaders,
			});
			const exportRoutes = routes.map((route) => toEcopagesRouteInfo(route));

			const staticExportContext = this.createStaticExportContext({
				router,
				baseUrl,
				routeRendererFactory,
				staticRoutes,
				force,
				routes: exportRoutes,
			});

			releases = await this.startStaticExports(staticExportContext);

			try {
				await this.executeStaticGenerationBody({
					router,
					baseUrl,
					routeRendererFactory,
					staticRoutes,
					errorPageLoaders,
					routes,
					skippedDynamicPages,
					pageFailures,
					activeStaticPathnames,
					sitemapEligiblePathnames,
				});
			} catch (error) {
				if (shouldPrebuildProductionPageBrowserGraphs()) {
					clearProductionPageBrowserGraphSession(this.appConfig);
				}
				throw error;
			}

			this.finalizeStaticGenerationRun({
				baseUrl,
				skippedDynamicPages,
				sitemapEligiblePathnames,
			});
			throwStaticGenerationPageFailures(pageFailures, keepGoing);
		} catch (error) {
			generationFailed = true;
			generationError = error;
		}
		clearProductionBrowserManifestOnFailure(this.appConfig, generationFailed);

		const cleanupErrors: unknown[] = [];
		try {
			await this.releaseStaticExports(releases);
		} catch (error) {
			cleanupErrors.push(error);
		}
		try {
			await teardownAppRuntimeIntegrations({ appConfig: this.appConfig });
		} catch (error) {
			cleanupErrors.push(error);
		}

		if (generationFailed) {
			if (cleanupErrors.length > 0) {
				throw new AggregateError([generationError, ...cleanupErrors], 'Static generation and cleanup failed', {
					cause: generationError,
				});
			}
			throw generationError;
		}
		if (cleanupErrors.length === 1) throw cleanupErrors[0];
		if (cleanupErrors.length > 1) {
			throw new AggregateError(cleanupErrors, 'Failed to clean up static generation resources');
		}
	}

	/**
	 * Loads each explicit static view, resolves its renderer and lists its pathnames.
	 *
	 * @remarks
	 * A view that fails here is recorded as a page failure and left out of both
	 * production browser-graph prebuild and generation.
	 */
	private async prepareExplicitStaticRoutes(input: {
		staticRoutes: StaticRoute[];
		routeRendererFactory: ExplicitStaticRouteRendererFactory;
		skipped: string[];
		failures: Error[];
	}): Promise<PreparedExplicitStaticRoute[]> {
		const prepared: PreparedExplicitStaticRoute[] = [];
		for (const route of input.staticRoutes) {
			try {
				const view = (await route.loader()).default;
				if (this.shouldSkipStaticView(route.path, view)) {
					input.skipped.push(route.path);
					continue;
				}
				const { renderer } = resolveExplicitViewRenderer({
					routePath: route.path,
					view,
					routeRendererFactory: input.routeRendererFactory,
					errors: STATIC_SITE_GENERATOR_ERRORS,
				});
				prepared.push({
					routePath: route.path,
					routeFile: route.loader.filePath,
					view,
					renderer,
					routeEntries: await this.listExplicitStaticRouteEntries(route.path, view),
				});
			} catch (error) {
				input.failures.push(createStaticGenerationPageError(route.path, error, 'explicit static page'));
			}
		}
		return prepared;
	}

	private async generateExplicitStaticPages(input: {
		staticRoutes: PreparedExplicitStaticRoute[];
		routeRendererFactory: ExplicitStaticRouteRendererFactory;
		failures: Error[];
		activeStaticPathnames?: Set<string>;
		sitemapEligiblePathnames?: Set<string>;
	}): Promise<void> {
		appLogger.debug(
			'Generating explicit static routes',
			input.staticRoutes.map((route) => route.routePath),
		);

		for (const route of input.staticRoutes) {
			await this.generateExplicitStaticRoute({
				routePath: route.routePath,
				view: route.view,
				renderer: route.renderer,
				routeEntries: route.routeEntries,
				routeRendererFactory: input.routeRendererFactory,
				failures: input.failures,
				activeStaticPathnames: input.activeStaticPathnames,
				sitemapEligiblePathnames: input.sitemapEligiblePathnames,
			});
		}
	}

	private async generateExplicitStaticRoute(input: {
		routePath: string;
		view: StaticGenerationPage;
		renderer: ExplicitViewRenderer;
		routeEntries: ExplicitStaticRouteEntry[];
		routeRendererFactory: ExplicitStaticRouteRendererFactory;
		failures: Error[];
		activeStaticPathnames?: Set<string>;
		sitemapEligiblePathnames?: Set<string>;
	}): Promise<void> {
		const {
			routePath,
			view,
			renderer,
			routeEntries,
			routeRendererFactory,
			failures,
			activeStaticPathnames,
			sitemapEligiblePathnames,
		} = input;
		for (const { pathname, params } of routeEntries) {
			try {
				let renderedMetadata: PageMetadataProps | undefined;
				await this.writeStaticPageArtifact({
					pathname,
					activeStaticPathnames,
					onSuccessfulExport: () =>
						this.considerSitemapEligibility({
							pathname,
							sitemapEligiblePathnames,
							resolveMetadata: async () => {
								if (!renderedMetadata) {
									throw new Error(`No metadata was rendered for ${pathname}`);
								}
								return renderedMetadata;
							},
						}),
					createContents: async () => {
						const { html, metadata } = await this.createExplicitStaticContents({
							routePath,
							view,
							params,
							routeRendererFactory,
							renderer,
						});
						renderedMetadata = metadata;
						return html;
					},
				});

				appLogger.debug(`Generated static page: ${pathname}`);
			} catch (error) {
				failures.push(createStaticGenerationPageError(pathname, error, 'explicit static page'));
			}
		}
	}

	private async createExplicitStaticContents(input: {
		routePath: string;
		view: StaticGenerationPage;
		params: Record<string, string | string[]>;
		routeRendererFactory: ExplicitStaticRouteRendererFactory;
		renderer: ExplicitViewRenderer;
	}): Promise<{ html: string; metadata?: PageMetadataProps }> {
		const { props, view: renderableView } = await prepareExplicitStaticRender({
			routePath: input.routePath,
			view: input.view,
			params: input.params,
			appConfig: this.appConfig,
			runtimeOrigin: this.appConfig.baseUrl,
			routeRendererFactory: input.routeRendererFactory,
			errors: STATIC_SITE_GENERATOR_ERRORS,
		});

		const result = await input.renderer.executeExplicitView(renderableView, props, { params: input.params });
		return { html: await new Response(result.body as BodyInit).text(), metadata: result.metadata };
	}

	private async listExplicitStaticRouteEntries(
		routePath: string,
		view: StaticGenerationPage,
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
			pathname: buildSegmentPath(routePath, params, 'explicit'),
			params,
		}));
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
