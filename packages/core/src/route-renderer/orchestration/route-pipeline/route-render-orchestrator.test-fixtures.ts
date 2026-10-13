import type { ProcessedAsset } from '../../../services/assets/asset-processing-service/index.ts';
import type {
	EcoComponent,
	EcoPageComponent,
	EcoPageFile,
	HtmlTemplateProps,
	PageBrowserGraphContribution,
	PageBrowserGraphContributionContext,
	PageMetadataProps,
	RouteRendererBody,
	RouteRendererOptions,
} from '../../../types/public-types.ts';
import { resolvePageLayoutComponents } from '../document-shell/layout-shell-props.service.ts';
import { createPageDependencyInstanceKey } from '../page-browser-graph/route-instance-key.ts';
import type { ResolvedPageDependencies } from '../../page-loading/resolved-page-dependencies.ts';
import type { RouteHtmlFinalization, RouteRenderOrchestratorAdapter } from './route-render-orchestrator.ts';

export interface FlowAdapterInput {
	name?: string;
	Page?: EcoPageComponent<any> | EcoComponent;
	integrationSpecificProps?: Record<string, unknown>;
	HtmlTemplate?: EcoComponent<HtmlTemplateProps>;
	pageData?: { props: Record<string, unknown>; metadata: PageMetadataProps };
	resolveDependencies?: (components: (EcoComponent | Partial<EcoComponent>)[]) => Promise<ProcessedAsset[]>;
	collectPageBrowserGraphContribution?: (
		context: PageBrowserGraphContributionContext,
	) => Promise<PageBrowserGraphContribution | undefined>;
	resolvePageDependencies?: (
		context: PageBrowserGraphContributionContext,
	) => Promise<ResolvedPageDependencies | undefined>;
	renderRouteBody?: () => Promise<RouteRendererBody>;
	getRouteHtmlFinalization?: () => RouteHtmlFinalization;
	transformRouteResponse?: (response: Response) => Promise<RouteRendererBody>;
}

/**
 * Builds a {@link RouteRenderOrchestratorAdapter} whose every input has a working default, so a
 * test names only the inputs it asserts on.
 *
 * @remarks
 * Defaults describe an empty page: a one-line `Page`, an empty `<html>` template, no
 * dependencies, an empty browser-graph contribution and a plain-text response transform.
 */
export function createFlowAdapter<C = unknown>(input: FlowAdapterInput = {}): RouteRenderOrchestratorAdapter<C> {
	const Page = input.Page ?? ((() => '<main>Page</main>') as unknown as EcoPageComponent<any>);
	const HtmlTemplate = input.HtmlTemplate ?? ((() => '<html></html>') as EcoComponent<HtmlTemplateProps>);
	const integrationSpecificProps = input.integrationSpecificProps ?? {};
	const pageData = input.pageData ?? {
		props: {},
		metadata: { title: 'Page', description: 'Page description' },
	};
	const pageModule = { default: Page, ...integrationSpecificProps } as EcoPageFile;

	return {
		name: input.name ?? 'string',
		resolveRouteRenderInputs: async () => {
			const Layouts = resolvePageLayoutComponents(Page.config?.layouts);

			return {
				Page,
				pageModule,
				HtmlTemplate,
				Layouts,
				Layout: Layouts[Layouts.length - 1],
				layoutEntries: Page.config?.layoutEntries,
				props: pageData.props,
				metadata: pageData.metadata,
				integrationSpecificProps,
			};
		},
		resolveRouteDependencies: async ({ components }) => ({
			resolvedDependencies: (await input.resolveDependencies?.(components)) ?? [],
		}),
		collectPageBrowserGraphContribution: async (context) =>
			input.collectPageBrowserGraphContribution
				? await input.collectPageBrowserGraphContribution(context)
				: { assets: [] },
		resolvePageDependencies: input.resolvePageDependencies ?? (async () => undefined),
		buildPageClientBrowserAssets: async () => ({
			processedAssets: [],
			islandRenderAssetsByFile: new Map(),
			lazyTriggers: [],
		}),
		buildPageBrowserGraphContributionContext: async (routeFile, routeOptions) => ({
			file: routeFile,
			pageModule,
			props: pageData.props,
			params: routeOptions?.params,
			query: routeOptions?.query,
			dependencyInstanceKey: createPageDependencyInstanceKey({
				params: routeOptions?.params,
				query: routeOptions?.query,
			}),
		}),
		renderRouteBody: input.renderRouteBody ?? (async () => ''),
		getRouteHtmlFinalization: input.getRouteHtmlFinalization ?? (() => ({})),
		transformRouteResponse: input.transformRouteResponse ?? (async (response) => await response.text()),
	};
}

export function createRouteOptions(file: string, overrides: Partial<RouteRendererOptions> = {}): RouteRendererOptions {
	return { file, params: {}, query: {}, ...overrides } as RouteRendererOptions;
}
