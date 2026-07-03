import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type {
	ComponentRenderResult,
	EcoComponent,
	EcoPageComponent,
	EcoPageFile,
	HtmlTemplateProps,
	IntegrationRendererRenderOptions,
	PageBrowserGraphContribution,
	PageBrowserGraphResult,
	PageMetadataProps,
	RouteRendererBody,
	RouteRendererOptions,
	RouteRenderResult,
} from '../../types/public-types.ts';
import type { AssetProcessingService, ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import type { HtmlDocumentContribution } from '../../services/html/html-transformer.service.ts';
import { inspectUnresolvedMarkerArtifactHtml } from './render-output.utils.ts';
import { OwnershipValidationService, throwIfOwnershipInvalid } from './ownership-validation.service.ts';
import {
	buildEagerSsrLazyAssetsFromGraph,
	collectResolvedLazyTriggersFromGraph,
	collectUsedIntegrationDependenciesFromGraph,
} from './component-graph-collectors.ts';
import { buildGlobalInjectorAssets } from './global-injector-assets.service.ts';
import { PageBrowserGraphService } from './page-browser-graph.service.ts';
import { buildPreparedRenderOptions } from './route-prepared-options.builder.ts';

export type RouteRenderOrchestratorResolvedInputs = {
	Page: EcoPageFile['default'] | EcoPageComponent<any>;
	HtmlTemplate: EcoComponent<HtmlTemplateProps>;
	Layout?: EcoComponent;
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
	 * Collects declarative Page Browser Graph requirements for one route.
	 */
	collectPageBrowserGraphContribution(routeFile: string): Promise<PageBrowserGraphContribution | undefined>;
	/**
	 * Resolves the optional page-root render through the foreign-child-aware component contract.
	 */
	resolveRoutePageComponentRender(input: {
		Page: EcoComponent;
		Layout?: EcoComponent;
		props: Record<string, unknown>;
		routeOptions: RouteRendererOptions;
	}): Promise<ComponentRenderResult | undefined>;
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
	 * collects processed assets, captures optional page-root render metadata, and
	 * produces the page package consumed by downstream HTML transformation.
	 */
	async prepareRenderOptions<C = unknown>(
		routeOptions: RouteRendererOptions,
		adapter: RouteRenderOrchestratorAdapter<C>,
	): Promise<IntegrationRendererRenderOptions<C>> {
		const resolvedInputs = await adapter.resolveRouteRenderInputs(routeOptions);
		const { Page, HtmlTemplate, Layout } = resolvedInputs;
		const validationErrors = this.ownershipValidationService.validate({
			currentIntegrationName: adapter.name,
			roots: [
				{ component: HtmlTemplate as EcoComponent, source: 'html-template' },
				...(Layout ? [{ component: Layout as EcoComponent, source: 'layout' as const }] : []),
				{ component: Page as EcoComponent, source: 'page' },
			],
		});
		throwIfOwnershipInvalid(validationErrors);

		const componentsToResolve = Layout ? [HtmlTemplate, Layout, Page] : [HtmlTemplate, Page];
		const [{ resolvedDependencies }, pageBrowserGraph, componentRender] = await Promise.all([
			adapter.resolveRouteDependencies({
				components: componentsToResolve,
			}),
			this.pageBrowserGraphService.resolvePageBrowserGraph({
				routeFile: routeOptions.file,
				integrationName: adapter.name,
				collectContribution: async (routeFile) => await adapter.collectPageBrowserGraphContribution(routeFile),
			}),
			adapter.resolveRoutePageComponentRender({
				Page: Page as EcoComponent,
				Layout,
				props: resolvedInputs.props,
				routeOptions,
			}),
		]);

		const allDependencies = [
			...resolvedDependencies,
			...collectUsedIntegrationDependenciesFromGraph(this.appConfig, componentsToResolve, adapter.name),
		];

		if (componentRender?.assets?.length) {
			allDependencies.push(...componentRender.assets);
		}

		const triggers = collectResolvedLazyTriggersFromGraph(componentsToResolve, adapter.name);
		const [globalAssets, eagerSsrLazyAssets] = await Promise.all([
			triggers.length > 0
				? buildGlobalInjectorAssets(this.appConfig, this.assetProcessingService, triggers, adapter.name)
				: Promise.resolve([]),
			buildEagerSsrLazyAssetsFromGraph(this.assetProcessingService, componentsToResolve, adapter.name),
		]);
		allDependencies.push(...globalAssets, ...eagerSsrLazyAssets);

		return buildPreparedRenderOptions<C>({
			routeOptions,
			resolvedInputs,
			resolvedDependencies,
			allDependencies,
			pageBrowserGraph,
			componentRender,
			appConfig: this.appConfig,
		});
	}

	async resolveDeclaredPageBrowserGraph(input: {
		routeFile: string;
		integrationName: string;
		collectContribution: (routeFile: string) => Promise<PageBrowserGraphContribution | undefined>;
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
		const renderExecution = await this.captureHtmlRender(async () => adapter.renderRouteBody(renderOptions));
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
			const body = await adapter.transformRouteResponse(
				new Response(renderExecution.body as BodyInit, {
					headers: {
						'Content-Type': 'text/html',
					},
				}),
				htmlFinalization.htmlContributions,
				renderOptions.pagePackage,
			);

			return {
				body,
				cacheStrategy: renderOptions.cacheStrategy,
			};
		}

		const finalization = htmlFinalization.finalizeHtml
			? htmlFinalization.finalizeHtml(unresolvedArtifactInspection.normalizedHtml)
			: unresolvedArtifactInspection.normalizedHtml;

		const body = await adapter.transformRouteResponse(
			new Response(finalization, {
				headers: {
					'Content-Type': 'text/html',
				},
			}),
			htmlFinalization.htmlContributions,
			renderOptions.pagePackage,
		);

		return {
			body,
			cacheStrategy: renderOptions.cacheStrategy,
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
