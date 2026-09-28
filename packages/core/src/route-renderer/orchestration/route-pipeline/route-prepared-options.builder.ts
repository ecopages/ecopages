import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type {
	EcoComponent,
	EcoPageComponent,
	EcoPageFile,
	HtmlTemplateProps,
	IntegrationRendererRenderOptions,
	PageBrowserGraphResult,
	PageMetadataProps,
	EcoPageLayoutEntry,
	PageProps,
	RouteRendererOptions,
} from '../../../types/public-types.ts';
import { createPagePackage, type ProcessedAsset } from '../../../services/assets/asset-processing-service/index.ts';
import { dedupeProcessedAssets } from '../page-browser-graph/processed-asset-dedupe.ts';
import { createPageLocalsProxy } from './route-prepared-options.utils.ts';

type PreparedRenderInputs = {
	Page: EcoPageFile['default'] | EcoPageComponent<any>;
	HtmlTemplate: EcoComponent<HtmlTemplateProps>;
	Layouts: EcoComponent[];
	Layout?: EcoComponent;
	layoutEntries?: EcoPageLayoutEntry[];
	props: Record<string, unknown>;
	metadata: PageMetadataProps;
	integrationSpecificProps: Record<string, unknown>;
};

/**
 * Assembles the final integration render options after route prep dependencies resolve.
 */
export function buildPreparedRenderOptions<C = unknown>(input: {
	routeOptions: RouteRendererOptions;
	resolvedInputs: PreparedRenderInputs;
	resolvedPageDependencyComponents?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>;
	resolvedDependencies: ProcessedAsset[];
	allDependencies: ProcessedAsset[];
	pageBrowserGraph?: PageBrowserGraphResult;
	appConfig: EcoPagesAppConfig;
}): IntegrationRendererRenderOptions<C> {
	const {
		routeOptions,
		resolvedInputs,
		resolvedPageDependencyComponents,
		resolvedDependencies,
		allDependencies,
		pageBrowserGraph,
	} = input;
	const { Page, HtmlTemplate, Layouts, Layout, layoutEntries, props, metadata, integrationSpecificProps } =
		resolvedInputs;

	const dedupedDependencies = dedupeProcessedAssets(allDependencies);
	const pagePackage = createPagePackage(dedupedDependencies, { pageBrowserGraph });
	const resolvedProps = props;
	const pageProps = {
		...resolvedProps,
		params: routeOptions.params || {},
		query: routeOptions.query || {},
	};
	const cacheStrategy = (Page as EcoPageComponent<any>).cache;
	const pageLocals =
		routeOptions.locals ?? (createPageLocalsProxy(routeOptions.file) as RouteRendererOptions['locals']);
	const locals = routeOptions.locals;
	const preparedOptions: IntegrationRendererRenderOptions<C> = {
		...routeOptions,
		resolvedPageDependencyComponents,
		resolvedDependencies,
		pagePackage,
		HtmlTemplate: HtmlTemplate as EcoComponent<HtmlTemplateProps, C>,
		Layouts,
		Layout,
		layoutEntries,
		props: resolvedProps,
		Page: Page as EcoComponent<PageProps, C>,
		metadata,
		params: routeOptions.params || {},
		query: routeOptions.query || {},
		pageProps,
		locals,
		pageLocals,
		cacheStrategy,
	};

	return {
		...integrationSpecificProps,
		...preparedOptions,
	};
}
