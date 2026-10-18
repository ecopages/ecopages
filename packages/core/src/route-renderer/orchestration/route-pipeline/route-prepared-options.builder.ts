import type { EcoPagesAppConfig } from '../../../config/internal-types.ts';
import type {
	EcoComponent,
	EcoPageComponent,
	EcoPageFile,
	HtmlTemplateProps,
	InternalIntegrationRendererRenderOptions,
	PageBrowserGraphResult,
	PageMetadataProps,
	EcoPageLayoutEntry,
	PageProps,
	RouteRendererOptions,
} from '../../../types/contracts.ts';
import { createPagePackage, type ProcessedAsset } from '../../../assets/asset-processing-service/index.ts';
import { dedupeProcessedAssets } from '../../../assets/processed-asset-dedupe.ts';
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
	pageDependencyComponents?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>;
	resolvedDependencies: ProcessedAsset[];
	allDependencies: ProcessedAsset[];
	pageBrowserGraph?: PageBrowserGraphResult;
	appConfig: EcoPagesAppConfig;
}): InternalIntegrationRendererRenderOptions<C> {
	const {
		routeOptions,
		resolvedInputs,
		pageDependencyComponents,
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
	const preparedOptions: InternalIntegrationRendererRenderOptions<C> = {
		...routeOptions,
		pageDependencyComponents,
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
