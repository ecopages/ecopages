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
import { getImportedViewPaths } from '../build/server/imported-view-plugin.ts';
import {
	clearProductionPageBrowserGraphSession,
	getPlannedRouteKey,
	prebuildProductionPageBrowserGraphs,
	shouldPrebuildProductionPageBrowserGraphs,
} from './production-page-browser-graph-prebuild.ts';
import { renderSitemap } from './sitemap.ts';
import type { PlannedRouteInstance } from '../route-renderer/orchestration/integration-renderer.ts';
import type { PlannedRoutePreparation } from '../route-renderer/orchestration/route-pipeline/route-render-orchestrator.ts';
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

/**
 * The production plan of one build, as static export consumes it.
 *
 * @remarks
 * `preparations` holds each planned Page's preparation until its HTML is rendered. `failed` holds the planning error
 * of each route static export would render, which reports it under the route's URL instead of running its data
 * hooks again.
 */
type StaticExportRoutePlans = {
	preparations: Map<string, PlannedRoutePreparation>;
	failed: Map<string, unknown>;
};

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

function describePlannedRoute(appConfig: EcoPagesAppConfig, routeInstance: PlannedRouteInstance): string {
	const relativeFile = path.relative(appConfig.rootDir, routeInstance.routeFile);
	const routeFile = relativeFile && !relativeFile.startsWith('..') ? relativeFile : routeInstance.routeFile;
	const params =
		routeInstance.params && Object.keys(routeInstance.params).length > 0 ? routeInstance.params : undefined;
	return params ? `${routeFile} ${JSON.stringify(params)}` : routeFile;
}

function throwStaticGenerationPageFailures(pageFailures: Error[], keepGoing: boolean): void {
	if (!keepGoing && pageFailures.length > 0) {
		throw new AggregateError(pageFailures, `Failed to generate ${pageFailures.length} static page(s)`);
	}
}

function clearProductionAssetLedgerOnFailure(appConfig: EcoPagesAppConfig, generationFailed: boolean): void {
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
		routeRendererFactory: StaticPageRouteRendererFactory,
	): Promise<boolean> {
		const pageModule: EcoPageFile = await routeRendererFactory.getPageRenderer(filePath).loadPageModule(filePath);
		return (pageModule.default as StaticGenerationPage).cache === 'dynamic';
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

	private writeStaticOutput(routePath: string, contents: string | Buffer, sourceFile?: string): string {
		const outputPath = this.getOutputPath(routePath, sourceFile);
		fileSystem.ensureDir(path.dirname(outputPath));
		fileSystem.write(outputPath, contents);
		return outputPath;
	}

	private async writeStaticPageArtifact(options: {
		pathname: string;
		sourceFile?: string;
		createContents: () => Promise<string | Buffer | null>;
		activeStaticPathnames?: Set<string>;
		onSuccessfulExport?: () => Promise<void>;
	}): Promise<void> {
		const contents = await options.createContents();
		if (contents === null) {
			return;
		}

		this.writeStaticOutput(options.pathname, contents, options.sourceFile);
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
		routePlans?: StaticExportRoutePlans;
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

		const planKey = getPlannedRouteKey({ routeFile: filePath, params });
		if (input.routePlans?.failed.has(planKey)) {
			throw input.routePlans.failed.get(planKey);
		}
		const planned = input.routePlans?.preparations.get(planKey);
		input.routePlans?.preparations.delete(planKey);

		if (await this.shouldSkipStaticPageFile(filePath, routeRendererFactory)) {
			skipped?.push(filePath);
			return null;
		}

		const renderer = routeRendererFactory.getPageRenderer(filePath);
		const result = await renderer.execute(
			{
				file: filePath,
				params: params as Record<string, string>,
			},
			planned,
		);

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
		routePlans?: StaticExportRoutePlans;
	}) {
		const { router, baseUrl, routeRendererFactory, skipped, activeStaticPathnames, sitemapEligiblePathnames } =
			input;
		const routes = input.preloadedRoutes ?? (await router.listStaticGenerationRoutes({ runtimeOrigin: baseUrl }));

		appLogger.debug(
			'Static Pages',
			routes.map((route) => route.requestUrl),
		);

		const failures = input.failures ?? [];

		await runWithConcurrency(routes, resolveBuildParallelism(), async (route) => {
			try {
				let renderedMetadata: PageMetadataProps | undefined;
				await this.writeStaticPageArtifact({
					pathname: route.pathname,
					sourceFile: route.templateRoute.filePath,
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
							routePlans: input.routePlans,
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

	/**
	 * Records a route instance the production build could not plan.
	 *
	 * @remarks
	 * A Page static export renders keeps the error, so export reports it under the Page's URL without running its
	 * data hooks again. Any other concrete instance, such as a Dynamic Page entry or an `app.static` route, is a page
	 * failure that fails the build unless it keeps going. A route template or an imported view is planned without
	 * the props a request supplies, so its failure is a warning: `ecopages start` then fails the requests that need
	 * a dependency only that plan would have recorded.
	 */
	private reportRoutePlanFailure(
		routeInstance: PlannedRouteInstance,
		error: unknown,
		context: { exportedRouteKeys: Set<string>; routePlans: StaticExportRoutePlans; pageFailures: Error[] },
	): void {
		const planKey = getPlannedRouteKey(routeInstance);
		if (context.exportedRouteKeys.has(planKey)) {
			context.routePlans.failed.set(planKey, error);
			return;
		}
		const route = describePlannedRoute(this.appConfig, routeInstance);
		if (routeInstance.isRouteTemplate) {
			appLogger.warn(
				`Could not plan ${route} without request props; \`ecopages start\` fails requests that need a dependency only it declares.`,
				error instanceof Error ? error.message : String(error),
			);
			return;
		}
		context.pageFailures.push(createStaticGenerationPageError(route, error, 'route plan'));
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

		const routePlans: StaticExportRoutePlans = { preparations: new Map(), failed: new Map() };
		if (shouldPrebuildProductionPageBrowserGraphs() && input.routeRendererFactory) {
			const dynamicRouteTemplates = (input.router.templateRoutes ?? [])
				.filter((route) => route.kind !== 'exact' && route.role === 'page')
				.map((route) => ({ routeFile: route.filePath, skipStaticProps: true, isRouteTemplate: true }));
			const dynamicPageEntries =
				(await input.router.listDynamicPagePathExpansions?.({
					runtimeOrigin: input.baseUrl,
				})) ?? [];
			const importedViews = getImportedViewPaths(this.appConfig).map((routeFile) => ({
				routeFile,
				skipStaticProps: true,
				isRouteTemplate: true,
			}));
			const exportedRouteKeys = new Set(
				input.routes.map((route) =>
					getPlannedRouteKey({ routeFile: route.templateRoute.filePath, params: route.params }),
				),
			);
			routePlans.preparations = await prebuildProductionPageBrowserGraphs(
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
					...importedViews,
					...explicitStaticRoutes.flatMap(({ routeFile, routeEntries }) =>
						routeFile ? routeEntries.map(({ params }) => ({ routeFile, params })) : [],
					),
				],
				input.routeRendererFactory,
				{
					onRouteFailure: (routeInstance, error) =>
						this.reportRoutePlanFailure(routeInstance, error, {
							exportedRouteKeys,
							routePlans,
							pageFailures: input.pageFailures,
						}),
				},
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
			routePlans,
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

	/**
	 * @remarks
	 * Sitemap locations use `appConfig.baseUrl` (config, `ECOPAGES_BASE_URL`, `--base-url`), the same canonical
	 * origin Pages resolve. The `baseUrl` passed to `run` is the serve origin used to enumerate routes and is not public.
	 */
	private finalizeStaticGenerationRun(input: {
		skippedDynamicPages: string[];
		sitemapEligiblePathnames?: Set<string>;
	}): void {
		if (this.appConfig.sitemap?.enabled && input.sitemapEligiblePathnames) {
			const locations = resolveSitemapLocations({
				eligiblePathnames: [...input.sitemapEligiblePathnames],
				sitemap: this.appConfig.sitemap,
				baseUrl: this.appConfig.baseUrl,
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
		requireAppRuntime(this.appConfig).staticGenerationActive = true;

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
				skippedDynamicPages,
				sitemapEligiblePathnames,
			});
			throwStaticGenerationPageFailures(pageFailures, keepGoing);
		} catch (error) {
			generationFailed = true;
			generationError = error;
		}
		requireAppRuntime(this.appConfig).staticGenerationActive = false;
		clearProductionAssetLedgerOnFailure(this.appConfig, generationFailed);

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
	 *
	 * @remarks
	 * The path depends only on the route and its own source file, never on sibling Pages. `/` is `index.html`
	 * and a trailing-slash route is `<route>index.html`. Otherwise a Page whose source file is named `index`
	 * (`pages/blog/index.tsx`, also for a dynamic `[slug]/index.tsx`) writes `<route>/index.html`, and any other
	 * Page (`pages/blog.tsx`, `[slug].tsx`) writes `<route>.html`. Explicit static routes and semantic error
	 * pages have no filesystem source, so they write `<route>.html`. Static serving resolves both layouts.
	 */
	private getOutputPath(routePath: string, sourceFile?: string): string {
		let outputName: string;

		if (routePath === '/') {
			outputName = 'index.html';
		} else if (routePath.endsWith('/')) {
			outputName = `${routePath}index.html`;
		} else if (sourceFile && path.basename(sourceFile).split('.')[0] === 'index') {
			outputName = `${routePath}/index.html`;
		} else {
			outputName = `${routePath}.html`;
		}

		return path.join(this.getExportDir(), outputName);
	}
}
