import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type {
	EcoComponent,
	EcoPageComponent,
	EcoPageFile,
	HtmlTemplateProps,
	IntegrationRendererRenderOptions,
	PageBrowserGraphContribution,
	PageBrowserGraphContributionContext,
	PageBrowserGraphResult,
	PageMetadataProps,
	RouteRendererBody,
	RouteRendererOptions,
	RouteRenderResult,
	EcoPageLayoutEntry,
} from '../../../types/public-types.ts';
import type {
	AssetProcessingService,
	ProcessedAsset,
} from '../../../services/assets/asset-processing-service/index.ts';
import { collectHtmlCacheSourceDependencyPaths } from '../../../services/cache/html-page-cache-dependency-index.ts';
import { getComponentIdentity } from '../../../eco/component-identity.ts';
import type { HtmlDocumentContribution } from '../../../services/html/html-transformer.service.ts';
import { inspectUnresolvedMarkerArtifactHtml } from './marker-artifact.utils.ts';
import {
	OwnershipValidationService,
	throwIfOwnershipInvalid,
} from '../ownership-graph/ownership-validation.service.ts';
import {
	buildEagerSsrLazyAssetsFromGraph,
	collectResolvedLazyTriggersFromGraph,
	collectUsedIntegrationDependenciesFromGraph,
} from '../ownership-graph/component-graph-collectors.ts';
import { buildGlobalInjectorAssets } from '../page-browser-graph/global-injector-assets.service.ts';
import { mergePageBrowserGraphContributions } from '../page-browser-graph/page-browser-graph-contribution.merge.ts';
import { PageBrowserGraphService } from '../page-browser-graph/page-browser-graph.service.ts';
import type { GroupedGraphBuildPlan } from '../page-browser-graph/grouped-graph-build-plan.ts';
import type { ResolvedPageDependencies } from '../../page-loading/resolved-page-dependencies.ts';
import { createPageDependencyInstanceKey } from '../page-browser-graph/route-instance-key.ts';
import { buildPreparedRenderOptions } from './route-prepared-options.builder.ts';
import { measureRouteRenderPhase } from '../../../diagnostics/request-pipeline-metrics.ts';

export type RouteRenderOrchestratorResolvedInputs = {
	Page: EcoPageFile['default'] | EcoPageComponent<any>;
	pageModule: EcoPageFile;
	HtmlTemplate: EcoComponent<HtmlTemplateProps>;
	Layouts: EcoComponent[];
	Layout?: EcoComponent;
	layoutEntries?: EcoPageLayoutEntry[];
	props: Record<string, unknown>;
	metadata: PageMetadataProps;
	integrationSpecificProps: Record<string, unknown>;
};

export type RouteRenderOrchestratorResolvedDependencies = {
	resolvedDependencies: ProcessedAsset[];
};

/**
 * Structural HTML work applied after the route body has been fully resolved.
 *
 * The shared route flow only needs to know whether a post-render HTML step
 * exists. When `finalizeHtml` is absent, the captured body can be reused as-is.
 */
export type RouteHtmlFinalization = {
	finalizeHtml?(html: string): string;
	htmlContributions?: HtmlDocumentContribution[];
};

export interface RouteRenderOrchestratorAdapter<C> {
	/**
	 * Name of the owning Integration for the current route render.
	 */
	readonly name: string;
	/**
	 * Loads the Integration-owned route inputs needed for one Page render.
	 */
	resolveRouteRenderInputs(routeOptions: RouteRendererOptions): Promise<RouteRenderOrchestratorResolvedInputs>;
	/**
	 * Resolves route-owned dependencies needed before Integration rendering starts.
	 */
	resolveRouteDependencies(input: {
		components: (EcoComponent | Partial<EcoComponent>)[];
	}): Promise<RouteRenderOrchestratorResolvedDependencies>;
	/**
	 * Collects declarative Page Browser Graph requirements for one route instance.
	 */
	collectPageBrowserGraphContribution(
		context: PageBrowserGraphContributionContext,
	): Promise<PageBrowserGraphContribution | undefined>;
	resolvePageDependencies(
		context: PageBrowserGraphContributionContext,
	): Promise<ResolvedPageDependencies | undefined>;
	/**
	 * Builds the graph contribution context for one route file and optional params.
	 */
	buildPageBrowserGraphContributionContext(
		routeFile: string,
		routeOptions?: Pick<RouteRendererOptions, 'params' | 'query'>,
	): Promise<PageBrowserGraphContributionContext>;
	/**
	 * Executes the Integration-specific route render.
	 */
	renderRouteBody(renderOptions: IntegrationRendererRenderOptions<C>): Promise<RouteRendererBody>;
	/**
	 * Returns the structural Html finalization plan for one prepared route render.
	 */
	getRouteHtmlFinalization(renderOptions: IntegrationRendererRenderOptions<C>): RouteHtmlFinalization;
	/**
	 * Runs SSR-policy response transformation and returns the body value exposed to callers.
	 */
	transformRouteResponse(
		response: Response,
		htmlContributions?: HtmlDocumentContribution[],
		pagePackage?: IntegrationRendererRenderOptions<C>['pagePackage'],
	): Promise<RouteRendererBody>;
}

/**
 * Captured route-render output in both replayable body and string HTML forms.
 */
export interface CapturedHtmlRenderResult {
	body: RouteRendererBody;
	html: string;
}

/**
 * Optional app-scoped collaborators used by the route render orchestrator.
 */
export interface RouteRenderOrchestratorDependencies {
	ownershipValidationService?: OwnershipValidationService;
	pageBrowserGraphService?: PageBrowserGraphService;
}

/**
 * Owns one route render from normalized module loading through final HTML output.
 *
 * This orchestrator keeps route rendering as one app-scoped unit while still
 * delegating integration-specific behavior through the adapter seam. It owns
 * route-root validation, dependency aggregation, page package creation, and the
 * final HTML/body handling that happens after the integration render returns.
 */
export class RouteRenderOrchestrator {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly assetProcessingService: AssetProcessingService;
	private readonly ownershipValidationService: OwnershipValidationService;
	private readonly pageBrowserGraphService: PageBrowserGraphService;

	constructor(
		appConfig: EcoPagesAppConfig,
		assetProcessingService: AssetProcessingService,
		dependencies: RouteRenderOrchestratorDependencies = {},
	) {
		this.appConfig = appConfig;
		this.assetProcessingService = assetProcessingService;
		this.ownershipValidationService =
			dependencies.ownershipValidationService ?? new OwnershipValidationService(appConfig);
		this.pageBrowserGraphService =
			dependencies.pageBrowserGraphService ?? new PageBrowserGraphService(appConfig, assetProcessingService);
	}

	/**
	 * Builds normalized route render options before the integration render runs.
	 *
	 * This preparation step validates route-root ownership, resolves page data,
	 * collects processed assets, and produces the page package consumed by downstream
	 * HTML transformation.
	 */
	async prepareRenderOptions<C = unknown>(
		routeOptions: RouteRendererOptions,
		adapter: RouteRenderOrchestratorAdapter<C>,
	): Promise<IntegrationRendererRenderOptions<C>> {
		const resolvedInputs = await measureRouteRenderPhase('resolve-route-inputs', () =>
			adapter.resolveRouteRenderInputs(routeOptions),
		);
		const finalProps = {
			...resolvedInputs.props,
			...(routeOptions.props ?? {}),
		};
		const finalResolvedInputs = {
			...resolvedInputs,
			props: finalProps,
		};
		const { Page, HtmlTemplate, Layouts } = finalResolvedInputs;
		await measureRouteRenderPhase('ownership-validation', async () => {
			const validationErrors = this.ownershipValidationService.validate({
				currentIntegrationName: adapter.name,
				roots: [
					{ component: HtmlTemplate as EcoComponent, source: 'html-template' },
					...Layouts.map((layout) => ({ component: layout as EcoComponent, source: 'layout' as const })),
					{ component: Page as EcoComponent, source: 'page' },
				],
			});
			throwIfOwnershipInvalid(validationErrors);
		});

		const componentsToResolve = [HtmlTemplate, ...Layouts, Page];
		const dependencyInstanceKey = createPageDependencyInstanceKey({
			params: routeOptions.params,
			query: routeOptions.query,
		});
		const graphContext: PageBrowserGraphContributionContext = {
			file: routeOptions.file,
			pageModule: finalResolvedInputs.pageModule,
			props: finalProps,
			params: routeOptions.params,
			query: routeOptions.query,
			dependencyInstanceKey,
		};
		const resolvedPageDependencies = await adapter.resolvePageDependencies(graphContext);
		const { resolvedDependencies } = await measureRouteRenderPhase('resolve-dependencies', () =>
			adapter.resolveRouteDependencies({
				components: componentsToResolve,
			}),
		);
		const pageBrowserGraph = await measureRouteRenderPhase('page-browser-graph', () =>
			this.pageBrowserGraphService.resolvePageBrowserGraph({
				routeFile: routeOptions.file,
				dependencyInstanceKey,
				integrationName: adapter.name,
				collectContribution: async () =>
					mergePageBrowserGraphContributions(
						await adapter.collectPageBrowserGraphContribution(graphContext),
						resolvedPageDependencies?.contribution,
					),
			}),
		);
		const graphDependencyPaths = this.pageBrowserGraphService.getDependencyPathsForRoute({
			integrationName: adapter.name,
			routeFile: routeOptions.file,
			dependencyInstanceKey,
		});
		const resolvedPageDependencyComponents = resolvedPageDependencies?.components ?? [];

		const allDependencies = [
			...resolvedDependencies,
			...collectUsedIntegrationDependenciesFromGraph(this.appConfig, componentsToResolve, adapter.name),
		];

		const triggers = collectResolvedLazyTriggersFromGraph(componentsToResolve, adapter.name);
		const [globalAssets, eagerSsrLazyAssets] = await Promise.all([
			triggers.length > 0
				? buildGlobalInjectorAssets(this.appConfig, this.assetProcessingService, triggers, adapter.name)
				: Promise.resolve([]),
			buildEagerSsrLazyAssetsFromGraph(this.assetProcessingService, componentsToResolve, adapter.name),
		]);
		allDependencies.push(...globalAssets, ...eagerSsrLazyAssets);

		const sourceDependencyPaths = collectHtmlCacheSourceDependencyPaths({
			routeFile: routeOptions.file,
			processedAssets: allDependencies,
			graphDependencyPaths,
			additionalSourcePaths: collectRenderShellSourcePaths(this.appConfig, componentsToResolve),
		});

		return {
			...buildPreparedRenderOptions<C>({
				routeOptions,
				resolvedInputs: finalResolvedInputs,
				resolvedPageDependencyComponents,
				resolvedDependencies,
				allDependencies,
				pageBrowserGraph,
				appConfig: this.appConfig,
			}),
			sourceDependencyPaths,
		};
	}

	async resolveDeclaredPageBrowserGraph(input: {
		routeFile: string;
		dependencyInstanceKey?: string;
		integrationName: string;
		collectContribution: () => Promise<PageBrowserGraphContribution | undefined>;
		groupedBuildPlan?: GroupedGraphBuildPlan;
	}): Promise<PageBrowserGraphResult | undefined> {
		return await this.pageBrowserGraphService.resolvePageBrowserGraph(input);
	}

	/**
	 * Captures one route render body as HTML while preserving a replayable body value.
	 */
	async captureHtmlRender(render: () => Promise<RouteRendererBody>): Promise<CapturedHtmlRenderResult> {
		const renderedBody = await render();
		const capturedRender = await this.captureRenderedBody(renderedBody);

		return {
			body: capturedRender.body,
			html: capturedRender.html,
		};
	}

	/**
	 * Executes the full route-render flow and returns the final body plus cache strategy.
	 */
	async execute<C = unknown>(
		options: RouteRendererOptions,
		adapter: RouteRenderOrchestratorAdapter<C>,
	): Promise<RouteRenderResult> {
		const renderOptions = await this.prepareRenderOptions(options, adapter);
		return this.executePrepared(renderOptions, adapter);
	}

	/**
	 * Executes the route-render finalization path for already prepared render options.
	 */
	async executePrepared<C = unknown>(
		renderOptions: IntegrationRendererRenderOptions<C>,
		adapter: RouteRenderOrchestratorAdapter<C>,
	): Promise<RouteRenderResult> {
		const renderExecution = await measureRouteRenderPhase('render-body', () =>
			this.captureHtmlRender(async () => adapter.renderRouteBody(renderOptions)),
		);
		const unresolvedArtifactInspection = inspectUnresolvedMarkerArtifactHtml(renderExecution.html);
		const htmlFinalization = adapter.getRouteHtmlFinalization(renderOptions);
		const hasUnresolvedMarkerHtml = unresolvedArtifactInspection.hasUnresolvedMarkerArtifacts;

		if (hasUnresolvedMarkerHtml) {
			throw new Error(
				'[ecopages] Route render returned unresolved eco-marker artifact HTML. Full-route unresolved-marker fallback has been removed; resolve mixed foreign children inside renderComponentWithForeignChildren().',
			);
		}

		const canReuseCapturedBody = !hasUnresolvedMarkerHtml && htmlFinalization.finalizeHtml === undefined;

		if (canReuseCapturedBody) {
			const responseBody = typeof renderExecution.body === 'string' ? renderExecution.body : renderExecution.html;
			const body = await measureRouteRenderPhase('transform-response', () =>
				adapter.transformRouteResponse(
					new Response(responseBody, {
						headers: {
							'Content-Type': 'text/html',
						},
					}),
					htmlFinalization.htmlContributions,
					renderOptions.pagePackage,
				),
			);

			return {
				body,
				cacheStrategy: renderOptions.cacheStrategy,
				sourceDependencyPaths: renderOptions.sourceDependencyPaths,
			};
		}

		const finalization = htmlFinalization.finalizeHtml
			? htmlFinalization.finalizeHtml(unresolvedArtifactInspection.normalizedHtml)
			: unresolvedArtifactInspection.normalizedHtml;

		const body = await measureRouteRenderPhase('transform-response', () =>
			adapter.transformRouteResponse(
				new Response(finalization, {
					headers: {
						'Content-Type': 'text/html',
					},
				}),
				htmlFinalization.htmlContributions,
				renderOptions.pagePackage,
			),
		);

		return {
			body,
			cacheStrategy: renderOptions.cacheStrategy,
			sourceDependencyPaths: renderOptions.sourceDependencyPaths,
		};
	}

	private async captureRenderedBody(body: RouteRendererBody): Promise<{ body: RouteRendererBody; html: string }> {
		const response = new Response(body as BodyInit);

		if (typeof body === 'string') {
			return {
				body,
				html: await response.text(),
			};
		}

		if (!response.body) {
			return {
				body,
				html: await response.text(),
			};
		}

		const [capturedBody, replayBody] = response.body.tee();

		return {
			body: replayBody,
			html: await new Response(capturedBody).text(),
		};
	}
}

function collectRenderShellSourcePaths(
	appConfig: EcoPagesAppConfig,
	components: Array<EcoComponent | Partial<EcoComponent>>,
): string[] {
	const sourcePaths = new Set<string>();

	if (appConfig.absolutePaths?.htmlTemplatePath) {
		sourcePaths.add(appConfig.absolutePaths.htmlTemplatePath);
	}

	for (const component of components) {
		const componentFile = getComponentIdentity(component)?.file;
		if (componentFile) {
			sourcePaths.add(componentFile);
		}
	}

	return [...sourcePaths];
}
