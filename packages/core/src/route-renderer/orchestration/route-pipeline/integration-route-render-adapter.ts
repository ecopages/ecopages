import type { ProcessedAsset } from '../../../services/assets/asset-processing-service/index.ts';
import type { HtmlDocumentContribution } from '../../../services/html/html-transformer.service.ts';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type {
	EcoComponent,
	EcoPageFile,
	IntegrationRendererRenderOptions,
	PageBrowserGraphContribution,
	PageBrowserGraphContributionContext,
	PagePackageResult,
	RouteRendererBody,
	RouteRendererOptions,
} from '../../../types/public-types.ts';
import { loadPageBrowserGraphContribution } from '../page-browser-graph/page-browser-graph-contribution.loader.ts';
import { buildRouteHtmlFinalization } from './route-html-finalization.service.ts';
import type {
	RouteHtmlFinalization,
	RouteRenderOrchestratorAdapter,
	RouteRenderOrchestratorResolvedInputs,
} from './route-render-orchestrator.ts';

/**
 * Host surface required to build the orchestrator adapter for one integration renderer.
 */
export type IntegrationRouteRenderAdapterHost<C> = {
	readonly name: string;
	readonly appConfig: EcoPagesAppConfig;
	readonly watch: boolean;
	readonly hostOwnsDevClient?: boolean;
	resolveRouteRenderInputs(routeOptions: RouteRendererOptions): Promise<RouteRenderOrchestratorResolvedInputs>;
	resolveRouteDependencies(input: {
		components: (EcoComponent | Partial<EcoComponent>)[];
	}): Promise<{ resolvedDependencies: ProcessedAsset[] }>;
	importPageFile(file: string): Promise<EcoPageFile>;
	collectPageBrowserGraphContribution(
		context: PageBrowserGraphContributionContext,
	): Promise<PageBrowserGraphContribution | undefined>;
	renderRouteBody(renderOptions: IntegrationRendererRenderOptions<C>): Promise<RouteRendererBody>;
	getDocumentAttributes(renderOptions: IntegrationRendererRenderOptions<C>): Record<string, string> | undefined;
	getHtmlDocumentContributions(options: {
		renderOptions: IntegrationRendererRenderOptions<C>;
		partial: boolean;
	}): HtmlDocumentContribution[] | undefined;
	applyAttributesToHtmlElement(html: string, attributes: Record<string, string>): string;
	transformRouteResponse(
		response: Response,
		htmlContributions?: HtmlDocumentContribution[],
		pagePackage?: PagePackageResult,
	): Promise<RouteRendererBody>;
};

/**
 * Builds the internal route-render adapter consumed by `RouteRenderOrchestrator`.
 */
export function createIntegrationRouteRenderAdapter<C>(
	host: IntegrationRouteRenderAdapterHost<C>,
): RouteRenderOrchestratorAdapter<C> {
	return {
		name: host.name,
		resolveRouteRenderInputs: (routeOptions) => host.resolveRouteRenderInputs(routeOptions),
		resolveRouteDependencies: (input) => host.resolveRouteDependencies(input),
		collectPageBrowserGraphContribution: (routeFile) =>
			loadPageBrowserGraphContribution(
				routeFile,
				(file) => host.importPageFile(file),
				(context) => host.collectPageBrowserGraphContribution(context),
			),
		renderRouteBody: (renderOptions) => host.renderRouteBody(renderOptions),
		getRouteHtmlFinalization: (renderOptions) =>
			buildRouteHtmlFinalization({
				appConfig: host.appConfig,
				watch: host.watch,
				hostOwnsDevClient: host.hostOwnsDevClient,
				integrationName: host.name,
				renderOptions,
				getDocumentAttributes: (options) => host.getDocumentAttributes(options),
				getHtmlDocumentContributions: (options) => host.getHtmlDocumentContributions(options),
				applyAttributesToHtmlElement: (html, attributes) => host.applyAttributesToHtmlElement(html, attributes),
			}),
		transformRouteResponse: (response, htmlContributions, pagePackage) =>
			host.transformRouteResponse(response, htmlContributions, pagePackage),
	};
}

export type { RouteHtmlFinalization };
