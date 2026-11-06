import path from 'node:path';
import type { EcoPagesAppConfig } from '../../../config/internal-types.ts';
import type {
	EcoComponent,
	EcoPageComponent,
	EcoPageFile,
	HtmlTemplateProps,
	InternalIntegrationRendererRenderOptions,
	PageBrowserGraphContribution,
	PageBrowserGraphContributionContext,
	PageMetadataProps,
	RouteRendererBody,
	RouteRendererOptions,
	RouteRenderResult,
	EcoPageLayoutEntry,
} from '../../../types/contracts.ts';
import type {
	AssetProcessingService,
	AssetProcessingIntegration,
	ProcessedAsset,
} from '../../../assets/asset-processing-service/index.ts';
import { isProductionRuntime } from '../../../utils/runtime.ts';
import { collectHtmlCacheSourceDependencyPaths } from '../../../page-cache/html-page-cache-dependency-index.ts';
import { requireAppRuntime } from '../../../utils/app-runtime.ts';
import type { HtmlDocumentContribution } from '../../../html/html-transformer.service.ts';
import { inspectUnresolvedMarkerArtifactHtml } from './marker-artifact.utils.ts';
import {
	createPreparedComponentGraphBuilder,
	type PreparedComponentGraphNode,
	type DeclaredOwnershipRoot,
	type PreparedComponentGraph,
} from '../ownership-graph/component-graph.ts';
import {
	OwnershipValidationService,
	throwIfOwnershipInvalid,
} from '../ownership-graph/ownership-validation.service.ts';
import {
	collectComponentGraphWatchPaths,
	collectUsedIntegrationDependenciesFromNames,
} from '../ownership-graph/component-graph-collectors.ts';
import { collectPageClientPlanFromGraph } from '../ownership-graph/page-client-plan.ts';
import { collectPreparedGraphComponents } from '../ownership-graph/prepared-graph-membership.ts';
import { buildGlobalInjectorAssets } from '../page-browser-graph/global-injector-assets.service.ts';
import { mergePageBrowserGraphContributions } from '../page-browser-graph/page-browser-graph-contribution.merge.ts';
import { PageBrowserGraphService } from '../page-browser-graph/page-browser-graph.service.ts';
import type { ResolvedPageDependencies } from '../../page-loading/resolved-page-dependencies.ts';
import type { IntegrationRenderer } from '../integration-renderer.ts';
import { createPageDependencyInstanceKey } from '../page-browser-graph/route-instance-key.ts';
import { buildPreparedRenderOptions } from './route-prepared-options.builder.ts';
import { measureRouteRenderPhase } from '../../../diagnostics/request-pipeline-metrics.ts';
import type { RequestPipelineMetricsState } from '../../../diagnostics/request-pipeline-metrics.ts';

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

export type RouteRenderHost<C> = Pick<
	IntegrationRenderer<C>,
	| 'name'
	| 'resolveRouteRenderInputs'
	| 'resolveRouteDependencies'
	| 'collectPageBrowserGraphContribution'
	| 'resolvePageDependenciesForRoute'
	| 'resolvePageDependencyContribution'
	| 'buildPageClientBrowserAssets'
	| 'renderRouteBody'
	| 'getRouteHtmlFinalization'
	| 'transformRouteResponse'
>;

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
	assetProcessingIntegration?: AssetProcessingIntegration;
}

export type PreparedRouteGraphContext = {
	dependencyInstanceKey: string;
	graphContext: PageBrowserGraphContributionContext;
	resolvedPageDependencies: ResolvedPageDependencies | undefined;
	/** Page Dependency nodes this preparation added to the graph. */
	pageDependencyNodes: PreparedComponentGraphNode[];
	shellGraph: PreparedComponentGraph;
	shellDependencyComponents: EcoComponent[];
	graph: PreparedComponentGraph;
};

/**
 * A route the production build planned: its inputs and graphs, with the page Dependencies left unprocessed.
 *
 * @remarks
 * {@link RouteRenderOrchestrator.prepareRenderOptions} takes it to process the route's dependencies once the
 * app-wide browser build recorded its outputs, without running the route's data hooks again.
 */
export type PlannedRoutePreparation = {
	resolvedInputs: RouteRenderOrchestratorResolvedInputs;
	graphContext: PreparedRouteGraphContext;
};

type PreparedRouteShellGraph = {
	graphBuilder: ReturnType<typeof createPreparedComponentGraphBuilder>;
	shellGraph: PreparedComponentGraph;
	shellDependencyComponents: EcoComponent[];
};

/**
 * Owns one route render from normalized module loading through final HTML output.
 *
 * This orchestrator keeps route rendering as one app-scoped unit while calling
 * the owning Integration renderer's hooks directly. It owns
 * route-root validation, dependency aggregation, page package creation, and the
 * final HTML/body handling that happens after the integration render returns.
 */
export class RouteRenderOrchestrator {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly assetProcessingService: AssetProcessingService;
	private readonly ownershipValidationService: OwnershipValidationService;
	private readonly pageBrowserGraphService: PageBrowserGraphService;
	private readonly requestPipelineMetrics: RequestPipelineMetricsState;

	constructor(
		appConfig: EcoPagesAppConfig,
		assetProcessingService: AssetProcessingService,
		dependencies: RouteRenderOrchestratorDependencies = {},
	) {
		this.appConfig = appConfig;
		this.requestPipelineMetrics = requireAppRuntime(appConfig).requestPipelineMetrics;
		this.assetProcessingService = assetProcessingService;
		this.ownershipValidationService =
			dependencies.ownershipValidationService ?? new OwnershipValidationService(appConfig);
		this.pageBrowserGraphService = new PageBrowserGraphService(
			appConfig,
			assetProcessingService,
			dependencies.assetProcessingIntegration,
		);
	}

	private async validateOwnershipGraph(graph: PreparedComponentGraph): Promise<void> {
		await measureRouteRenderPhase(this.requestPipelineMetrics, 'ownership-validation', async () => {
			const validationErrors = this.ownershipValidationService.validateGraph(graph);
			throwIfOwnershipInvalid(validationErrors);
		});
	}

	/**
	 * Shares route graph preparation with the production grouped prebuild.
	 *
	 * @internal
	 */
	async prepareRouteGraphContext<C>(input: {
		routeOptions: RouteRendererOptions;
		resolvedInputs: RouteRenderOrchestratorResolvedInputs;
		props: Record<string, unknown>;
		renderer: RouteRenderHost<C>;
		/** Collects the page-dependency nodes without processing them, as the production prebuild plans a route. */
		planning?: true;
	}): Promise<PreparedRouteGraphContext> {
		const { routeOptions, resolvedInputs, props, renderer } = input;
		const shell = await this.prepareRouteShellGraph(routeOptions, resolvedInputs, renderer);
		const dependencyInstanceKey = createPageDependencyInstanceKey({
			params: routeOptions.params,
			query: routeOptions.query,
		});
		const graphContext: PageBrowserGraphContributionContext = {
			file: routeOptions.file,
			pageModule: resolvedInputs.pageModule,
			props,
			params: routeOptions.params,
			query: routeOptions.query,
			dependencyInstanceKey,
		};
		const pageGraph = await this.preparePageDependencyGraph({
			renderer,
			graphContext,
			graphBuilder: shell.graphBuilder,
			planning: input.planning,
		});

		return {
			dependencyInstanceKey,
			graphContext,
			resolvedPageDependencies: pageGraph.resolvedPageDependencies,
			pageDependencyNodes: pageGraph.pageDependencyNodes,
			shellGraph: shell.shellGraph,
			shellDependencyComponents: shell.shellDependencyComponents,
			graph: pageGraph.graph,
		};
	}

	private async prepareRouteShellGraph<C>(
		routeOptions: RouteRendererOptions,
		resolvedInputs: RouteRenderOrchestratorResolvedInputs,
		renderer: RouteRenderHost<C>,
	): Promise<PreparedRouteShellGraph> {
		const shellRoots: DeclaredOwnershipRoot[] = [
			{ component: resolvedInputs.HtmlTemplate as EcoComponent, source: 'html-template' },
			...resolvedInputs.Layouts.map((layout) => ({
				component: layout as EcoComponent,
				source: 'layout' as const,
			})),
			{ component: resolvedInputs.Page as EcoComponent, source: 'page' },
		];
		const graphBuilder = createPreparedComponentGraphBuilder(renderer.name);
		graphBuilder.addRoots(shellRoots);
		const shellGraph = graphBuilder.getGraph({ updateForeignDescendantFlags: false });
		const shellDependencyComponents = shellGraph.nodes
			.filter((node) => node.dependencyCollectionVisible)
			.map((node) => node.component);
		await this.validateOwnershipGraph(shellGraph);
		return { graphBuilder, shellGraph, shellDependencyComponents };
	}

	private async preparePageDependencyGraph<C>(input: {
		renderer: RouteRenderHost<C>;
		graphContext: PageBrowserGraphContributionContext;
		graphBuilder: ReturnType<typeof createPreparedComponentGraphBuilder>;
		planning?: true;
	}): Promise<Pick<PreparedRouteGraphContext, 'resolvedPageDependencies' | 'pageDependencyNodes' | 'graph'>> {
		const { renderer, graphContext, graphBuilder } = input;
		const resolvedPageDependencies = await renderer.resolvePageDependenciesForRoute(graphContext);
		const pageDependencyNodes = this.collectPageDependencyNodes(
			graphBuilder,
			resolvedPageDependencies?.components ?? [],
		);
		const pageDependencyContribution = input.planning
			? undefined
			: await this.resolvePageDependencyContribution(renderer, resolvedPageDependencies, pageDependencyNodes);
		const graph = graphBuilder.getGraph();
		if (resolvedPageDependencies?.components.length) {
			await this.validateOwnershipGraph(graph);
		}
		return {
			graph,
			pageDependencyNodes,
			resolvedPageDependencies: resolvedPageDependencies
				? { ...resolvedPageDependencies, contribution: pageDependencyContribution }
				: undefined,
		};
	}

	private collectPageDependencyNodes(
		graphBuilder: ReturnType<typeof createPreparedComponentGraphBuilder>,
		components: ReadonlyArray<EcoComponent | Partial<EcoComponent>>,
	): PreparedComponentGraphNode[] {
		const { nodes } = graphBuilder.addRootsAndCollectNodes(
			components.map((component) => ({ component, source: 'dependency' })),
		);
		return nodes.filter((node) => node.dependencyCollectionVisible);
	}

	private async processPlannedPageDependencies<C>(
		renderer: RouteRenderHost<C>,
		planned: PreparedRouteGraphContext,
	): Promise<PreparedRouteGraphContext> {
		const resolved = planned.resolvedPageDependencies;
		if (!resolved) return planned;
		return {
			...planned,
			resolvedPageDependencies: {
				...resolved,
				contribution: await this.resolvePageDependencyContribution(
					renderer,
					resolved,
					planned.pageDependencyNodes,
				),
			},
		};
	}

	private resolvePageDependencyContribution<C>(
		renderer: RouteRenderHost<C>,
		resolvedPageDependencies: ResolvedPageDependencies | undefined,
		pageDependencyNodes: ReadonlyArray<PreparedComponentGraphNode>,
	): Promise<PageBrowserGraphContribution | undefined> {
		if (resolvedPageDependencies?.contribution) {
			return Promise.resolve(resolvedPageDependencies.contribution);
		}
		if (!resolvedPageDependencies || resolvedPageDependencies.components.length === 0) {
			return Promise.resolve(undefined);
		}

		return renderer.resolvePageDependencyContribution({
			nodes: pageDependencyNodes,
			ownerFile: resolvedPageDependencies.ownerFile,
		});
	}

	/**
	 * Builds normalized route render options before the integration render runs.
	 *
	 * This preparation step validates route-root ownership, resolves page data,
	 * collects processed assets, and produces the page package consumed by downstream
	 * HTML transformation. With a `planned` preparation it reuses the inputs and graphs the production build
	 * planned and only processes the route's dependencies.
	 */
	async prepareRenderOptions<C = unknown>(
		routeOptions: RouteRendererOptions,
		renderer: RouteRenderHost<C>,
		planned?: PlannedRoutePreparation,
	): Promise<InternalIntegrationRendererRenderOptions<C>> {
		const resolvedInputs =
			planned?.resolvedInputs ??
			(await measureRouteRenderPhase(this.requestPipelineMetrics, 'resolve-route-inputs', () =>
				renderer.resolveRouteRenderInputs(routeOptions),
			));
		const finalProps = {
			...resolvedInputs.props,
			...(routeOptions.props ?? {}),
		};
		const finalResolvedInputs = {
			...resolvedInputs,
			props: finalProps,
		};
		const graphContext = planned
			? await this.processPlannedPageDependencies(renderer, planned.graphContext)
			: await this.prepareRouteGraphContext({
					routeOptions,
					resolvedInputs: finalResolvedInputs,
					props: finalProps,
					renderer,
				});
		const {
			dependencyInstanceKey,
			graphContext: contributionContext,
			resolvedPageDependencies,
			shellDependencyComponents,
			graph: preparedGraph,
		} = graphContext;
		const { resolvedDependencies } = await measureRouteRenderPhase(
			this.requestPipelineMetrics,
			'resolve-dependencies',
			() =>
				renderer.resolveRouteDependencies({
					components: shellDependencyComponents,
				}),
		);
		const pageBrowserGraph = await measureRouteRenderPhase(this.requestPipelineMetrics, 'page-browser-graph', () =>
			this.pageBrowserGraphService.resolvePageBrowserGraph({
				routeFile: routeOptions.file,
				dependencyInstanceKey,
				integrationName: renderer.name,
				cacheable: !routeOptions.pageModule && !routeOptions.props && !routeOptions.skipStaticProps,
				collectContribution: async () =>
					mergePageBrowserGraphContributions(
						await renderer.collectPageBrowserGraphContribution(contributionContext),
						resolvedPageDependencies?.contribution,
					),
			}),
		);
		const graphDependencyPaths = this.pageBrowserGraphService.getDependencyPathsForRoute({
			integrationName: renderer.name,
			routeFile: routeOptions.file,
			dependencyInstanceKey,
		});
		const pageDependencyComponents = resolvedPageDependencies?.components ?? [];
		const clientPlan = collectPageClientPlanFromGraph(preparedGraph);
		const clientBrowserAssets = await renderer.buildPageClientBrowserAssets(clientPlan, routeOptions);
		if (clientBrowserAssets.lazyTriggers.length > 0) {
			clientPlan.lazyTriggers = clientBrowserAssets.lazyTriggers;
		}

		const allDependencies = [
			...resolvedDependencies,
			...clientBrowserAssets.processedAssets,
			...collectUsedIntegrationDependenciesFromNames(this.appConfig, clientPlan.integrationNames, renderer.name),
		];

		const triggers = clientPlan.lazyTriggers;
		const globalAssets =
			triggers.length > 0
				? await buildGlobalInjectorAssets(this.appConfig, this.assetProcessingService, triggers, renderer.name)
				: [];
		allDependencies.push(...globalAssets);

		const sourceDependencyPaths = isProductionRuntime()
			? undefined
			: this.recordSourceDependencyPaths({
					routeFile: routeOptions.file,
					graph: preparedGraph,
					processedAssets: allDependencies,
					graphDependencyPaths,
				});

		return {
			...buildPreparedRenderOptions<C>({
				routeOptions,
				resolvedInputs: finalResolvedInputs,
				pageDependencyComponents,
				resolvedDependencies,
				allDependencies,
				pageBrowserGraph,
				appConfig: this.appConfig,
			}),
			sourceDependencyPaths,
			pageClientPlan: clientPlan,
			preparedGraphComponents: collectPreparedGraphComponents(preparedGraph),
		};
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
		renderer: RouteRenderHost<C>,
	): Promise<RouteRenderResult> {
		const renderOptions = await this.prepareRenderOptions(options, renderer);
		return this.executePrepared(renderOptions, renderer);
	}

	/**
	 * Executes the route-render finalization path for already prepared render options.
	 */
	async executePrepared<C = unknown>(
		renderOptions: InternalIntegrationRendererRenderOptions<C>,
		renderer: RouteRenderHost<C>,
	): Promise<RouteRenderResult> {
		const renderExecution = await measureRouteRenderPhase(this.requestPipelineMetrics, 'render-body', () =>
			this.captureHtmlRender(async () => renderer.renderRouteBody(renderOptions)),
		);
		const sourceDependencyPaths = this.withHtmlTemplateClosure(renderOptions.sourceDependencyPaths);
		const unresolvedArtifactInspection = inspectUnresolvedMarkerArtifactHtml(renderExecution.html);
		const htmlFinalization = renderer.getRouteHtmlFinalization(renderOptions);
		const hasUnresolvedMarkerHtml = unresolvedArtifactInspection.hasUnresolvedMarkerArtifacts;

		if (hasUnresolvedMarkerHtml) {
			throw new Error(
				'[ecopages] Route render returned unresolved eco-marker artifact HTML. Full-route unresolved-marker fallback has been removed; resolve mixed foreign children inside renderComponentWithForeignChildren().',
			);
		}

		const canReuseCapturedBody = !hasUnresolvedMarkerHtml && htmlFinalization.finalizeHtml === undefined;

		if (canReuseCapturedBody) {
			const responseBody = typeof renderExecution.body === 'string' ? renderExecution.body : renderExecution.html;
			const body = await measureRouteRenderPhase(this.requestPipelineMetrics, 'transform-response', () =>
				renderer.transformRouteResponse(
					new Response(responseBody, {
						headers: {
							'Content-Type': 'text/html',
						},
					}),
					htmlFinalization.htmlContributions,
					renderOptions,
				),
			);

			return {
				body,
				cacheStrategy: renderOptions.cacheStrategy,
				sourceDependencyPaths,
				metadata: renderOptions.metadata,
			};
		}

		const finalization = htmlFinalization.finalizeHtml
			? htmlFinalization.finalizeHtml(unresolvedArtifactInspection.normalizedHtml)
			: unresolvedArtifactInspection.normalizedHtml;

		const body = await measureRouteRenderPhase(this.requestPipelineMetrics, 'transform-response', () =>
			renderer.transformRouteResponse(
				new Response(finalization, {
					headers: {
						'Content-Type': 'text/html',
					},
				}),
				htmlFinalization.htmlContributions,
				renderOptions,
			),
		);

		return {
			body,
			cacheStrategy: renderOptions.cacheStrategy,
			sourceDependencyPaths,
			metadata: renderOptions.metadata,
		};
	}

	/**
	 * Collects the files a rendered page read and records them as watch paths.
	 *
	 * @remarks
	 * These paths exist so development can evict the pages a changed file affects. A production
	 * process has no watcher and no source edits, so it skips the collection on every request.
	 */
	private recordSourceDependencyPaths(input: {
		routeFile: string;
		graph: PreparedComponentGraph;
		processedAssets: Parameters<typeof collectHtmlCacheSourceDependencyPaths>[0]['processedAssets'];
		graphDependencyPaths: ReadonlySet<string> | undefined;
	}): string[] {
		const buildInputIndex = requireAppRuntime(this.appConfig).buildInputIndex;
		const sourceDependencyPaths = collectHtmlCacheSourceDependencyPaths({
			routeFile: input.routeFile,
			processedAssets: input.processedAssets,
			graphDependencyPaths: input.graphDependencyPaths,
			additionalSourcePaths: collectRenderShellSourcePaths(this.appConfig, input.graph),
			routeModulePaths: buildInputIndex.sourcePaths({
				consumer: 'server-route-module',
				key: path.resolve(input.routeFile),
			}),
		});
		for (const sourcePath of sourceDependencyPaths) {
			buildInputIndex.recordWatchPath(sourcePath);
		}
		return sourceDependencyPaths;
	}

	/**
	 * @remarks
	 * The HTML template imports its includes (head, SEO, scripts) when the body renders, so its module
	 * closure is recorded only then. Editing any of them must miss the cached document.
	 */
	private withHtmlTemplateClosure(sourcePaths: readonly string[] | undefined): readonly string[] | undefined {
		const htmlTemplatePath = this.appConfig.absolutePaths?.htmlTemplatePath;
		if (!sourcePaths || !htmlTemplatePath) {
			return sourcePaths;
		}

		const templateClosure = requireAppRuntime(this.appConfig).buildInputIndex.sourcePaths({
			consumer: 'server-route-module',
			key: path.resolve(htmlTemplatePath),
		});
		return [...new Set([...sourcePaths, ...templateClosure])];
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

/**
 * @remarks
 * Nested Component identity files and named barrel hops must be HTML cache
 * inputs and recorded watch paths. Editing a child that contributes inferred
 * CSS, or retargeting a barrel the Page imports, has to miss the cached
 * document even when HTML cache registration is skipped.
 */
function collectRenderShellSourcePaths(appConfig: EcoPagesAppConfig, graph: PreparedComponentGraph): string[] {
	const additionalPaths = appConfig.absolutePaths?.htmlTemplatePath ? [appConfig.absolutePaths.htmlTemplatePath] : [];
	return collectComponentGraphWatchPaths(graph.nodes, additionalPaths);
}
