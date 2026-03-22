import { createRequire } from 'node:module';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import type {
	ComponentRenderResult,
	EcoComponent,
	EcoComponentConfig,
	DependencyAttributes,
	EcoPageComponent,
	EcoPageFile,
	EcoPagesElement,
	GetMetadata,
	GetStaticProps,
	HtmlTemplateProps,
	IntegrationRendererRenderOptions,
	PageProps,
	PageMetadataProps,
	ResolvedLazyTrigger,
	RouteRendererOptions,
} from '../../public-types.ts';
import {
	type AssetProcessingService,
	AssetFactory,
	type ProcessedAsset,
} from '../../services/assets/asset-processing-service/index.ts';
import { buildGlobalInjectorBootstrapContent, buildGlobalInjectorMapScript } from '../../eco/global-injector-map.ts';
import {
	runWithComponentRenderContext,
	type ComponentRenderBoundaryContext,
} from '../../eco/component-render-context.ts';

const coreRequire = createRequire(import.meta.url);

type ResolvedPageModule = {
	Page: EcoPageFile['default'] | EcoPageComponent<any>;
	getStaticProps?: GetStaticProps<Record<string, unknown>>;
	getMetadata?: GetMetadata;
	integrationSpecificProps: Record<string, unknown>;
};

export interface RenderPreparationCallbacks {
	resolvePageModule(file: string): Promise<ResolvedPageModule>;
	getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>>;
	resolvePageData(
		pageModule: {
			getStaticProps?: GetStaticProps<Record<string, unknown>>;
			getMetadata?: GetMetadata;
		},
		routeOptions: RouteRendererOptions,
	): Promise<{ props: Record<string, unknown>; metadata: PageMetadataProps }>;
	resolveDependencies(components: (EcoComponent | Partial<EcoComponent>)[]): Promise<ProcessedAsset[]>;
	buildRouteRenderAssets(file: string): Promise<ProcessedAsset[]> | undefined;
	shouldRenderPageComponent(input: {
		Page: EcoComponent;
		Layout?: EcoComponent;
		options: RouteRendererOptions;
	}): boolean;
	renderPageComponent(input: {
		component: EcoComponent;
		props: Record<string, unknown>;
	}): Promise<ComponentRenderResult>;
	/**
	 * Returns the boundary policy context that should be active while rendering
	 * page-root component output during preparation.
	 */
	getComponentRenderBoundaryContext(): ComponentRenderBoundaryContext;
	setProcessedDependencies(dependencies: ProcessedAsset[]): void;
	dedupeProcessedAssets(assets: ProcessedAsset[]): ProcessedAsset[];
	createPageLocalsProxy(filePath: string): RouteRendererOptions['locals'];
}

/**
 * Prepares the normalized render inputs consumed by `IntegrationRenderer.execute()`.
 *
 * This service owns the orchestration that happens before the main HTML render:
 * page module resolution, data loading, dependency aggregation, page-root
 * component artifact capture, lazy trigger bootstrap generation, and request
 * locals policy.
 */
export class RenderPreparationService {
	private appConfig: EcoPagesAppConfig;
	private assetProcessingService: AssetProcessingService;

	/**
	 * Creates the render-preparation orchestrator for one app instance.
	 *
	 * @remarks
	 * The service is app-scoped because it depends on finalized config defaults and
	 * the app-owned asset-processing pipeline while remaining renderer-agnostic.
	 */
	constructor(appConfig: EcoPagesAppConfig, assetProcessingService: AssetProcessingService) {
		this.appConfig = appConfig;
		this.assetProcessingService = assetProcessingService;
	}

	/**
	 * Builds the final render options object used by the integration-specific
	 * renderer.
	 *
	 * The returned object contains normalized page data, processed dependency
	 * state, component render artifacts, and the locals contract expected by the
	 * rest of the pipeline.
	 *
	 * @typeParam C Integration render output element type.
	 * @param routeOptions Route-level render inputs.
	 * @param currentIntegrationName Active integration name for this preparation pass.
	 * @param callbacks Renderer-specific hooks used during preparation.
	 * @returns Normalized render options.
	 */
	async prepare<C = EcoPagesElement>(
		routeOptions: RouteRendererOptions,
		currentIntegrationName: string,
		callbacks: RenderPreparationCallbacks,
	): Promise<IntegrationRendererRenderOptions<C>> {
		const pageModule = await callbacks.resolvePageModule(routeOptions.file);
		const { Page, integrationSpecificProps } = pageModule;
		const HtmlTemplate = await callbacks.getHtmlTemplate();
		const { props, metadata } = await callbacks.resolvePageData(pageModule, routeOptions);
		const Layout = Page.config?.layout;

		const componentsToResolve = Layout ? [HtmlTemplate, Layout, Page] : [HtmlTemplate, Page];
		const resolvedDependencies = await callbacks.resolveDependencies(componentsToResolve);
		const usedIntegrationDependencies = this.collectUsedIntegrationDependencies(
			componentsToResolve,
			currentIntegrationName,
		);
		const pageDeps = (await callbacks.buildRouteRenderAssets(routeOptions.file)) || [];
		const allDependencies = [...resolvedDependencies, ...usedIntegrationDependencies, ...pageDeps];

		let componentRender: ComponentRenderResult | undefined;
		if (callbacks.shouldRenderPageComponent({ Page, Layout, options: routeOptions })) {
			componentRender = await this.renderPageRoot({
				currentIntegrationName,
				Page: Page as EcoComponent,
				props,
				routeOptions,
				callbacks,
			});

			if (componentRender.assets?.length) {
				allDependencies.push(...componentRender.assets);
			}
		}

		const triggers = this.collectResolvedTriggers(componentsToResolve);
		if (triggers.length > 0) {
			const globalAssets = await this.buildGlobalInjectorAssets(triggers, currentIntegrationName);
			allDependencies.push(...globalAssets);
		}

		const eagerSsrLazyAssets = await this.buildEagerSsrLazyAssets(componentsToResolve, currentIntegrationName);
		if (eagerSsrLazyAssets.length > 0) {
			allDependencies.push(...eagerSsrLazyAssets);
		}

		callbacks.setProcessedDependencies(callbacks.dedupeProcessedAssets(allDependencies));

		const pageProps = {
			...props,
			params: routeOptions.params || {},
			query: routeOptions.query || {},
		};

		const cacheStrategy = (Page as EcoPageComponent<any>).cache;
		const defaultCacheStrategy = this.appConfig.cache?.defaultStrategy ?? 'static';
		const effectiveCacheStrategy = cacheStrategy ?? defaultCacheStrategy;
		const localsAvailable = effectiveCacheStrategy === 'dynamic' && routeOptions.locals !== undefined;

		const pageLocals = localsAvailable ? routeOptions.locals! : callbacks.createPageLocalsProxy(routeOptions.file);

		const locals = localsAvailable ? routeOptions.locals : undefined;
		const preparedOptions: IntegrationRendererRenderOptions<C> = {
			...routeOptions,
			resolvedDependencies,
			componentRender,
			HtmlTemplate: HtmlTemplate as EcoComponent<HtmlTemplateProps, C>,
			Layout,
			props,
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

	/**
	 * Collects resolved lazy trigger metadata from the component tree.
	 *
	 * Traversal is depth-first and deduplicated by component identity so shared
	 * component dependencies do not emit duplicate trigger sets.
	 *
	 * @param components Root component set.
	 * @param seen Internal visited set for shared graphs.
	 * @returns All resolved lazy triggers reachable from the root set.
	 */
	private collectResolvedTriggers(
		components: (EcoComponent | Partial<EcoComponent>)[],
		seen = new Set<object>(),
	): ResolvedLazyTrigger[] {
		const triggers: ResolvedLazyTrigger[] = [];
		for (const comp of components) {
			const ecoComp = comp as EcoComponent;
			if (seen.has(ecoComp)) {
				continue;
			}
			seen.add(ecoComp);
			const ownTriggers = ecoComp.config?._resolvedLazyTriggers;
			if (ownTriggers?.length) {
				triggers.push(...ownTriggers);
			}
			const nested = ecoComp.config?.dependencies?.components;
			if (nested?.length) {
				triggers.push(...this.collectResolvedTriggers(nested, seen));
			}
		}
		return triggers;
	}

	/**
	 * Collects global integration dependencies used by nested components belonging
	 * to integrations other than the current renderer.
	 *
	 * @param components Root component set.
	 * @returns Processed integration dependencies contributed by nested integrations.
	 */
	private collectUsedIntegrationDependencies(
		components: (EcoComponent | Partial<EcoComponent>)[],
		currentIntegrationName: string,
	): ProcessedAsset[] {
		const integrationNames = this.collectIntegrationNames(components);
		const dependencies: ProcessedAsset[] = [];

		for (const integrationName of integrationNames) {
			if (integrationName === currentIntegrationName) {
				continue;
			}

			const integrationPlugin = this.appConfig.integrations.find(
				(integration) => integration.name === integrationName,
			);
			if (!integrationPlugin || typeof integrationPlugin.getResolvedIntegrationDependencies !== 'function') {
				continue;
			}

			dependencies.push(...integrationPlugin.getResolvedIntegrationDependencies());
		}

		return dependencies;
	}

	/**
	 * Discovers integration names referenced by the component dependency graph.
	 *
	 * @param components Root component set.
	 * @param seen Internal visited set for shared graphs.
	 * @returns Set of integration names found in the graph.
	 */
	private collectIntegrationNames(
		components: (EcoComponent | Partial<EcoComponent>)[],
		seen = new Set<object>(),
	): Set<string> {
		const integrationNames = new Set<string>();

		for (const comp of components) {
			const ecoComp = comp as EcoComponent;
			if (seen.has(ecoComp)) {
				continue;
			}
			seen.add(ecoComp);

			const integrationName = ecoComp.config?.integration ?? ecoComp.config?.__eco?.integration;
			if (integrationName) {
				integrationNames.add(integrationName);
			}

			const nested = ecoComp.config?.dependencies?.components;
			if (nested?.length) {
				const nestedNames = this.collectIntegrationNames(nested, seen);
				for (const nestedName of nestedNames) {
					integrationNames.add(nestedName);
				}
			}
		}

		return integrationNames;
	}

	/**
	 * Renders the page root through the component-level render contract so any
	 * integration-specific assets and root attributes are available before the main
	 * document render.
	 *
	 * @param input Page root render inputs.
	 * @returns Structured component render result.
	 */
	private async renderPageRoot(input: {
		currentIntegrationName: string;
		Page: EcoComponent;
		props: Record<string, unknown>;
		routeOptions: RouteRendererOptions;
		callbacks: RenderPreparationCallbacks;
	}): Promise<ComponentRenderResult> {
		const execution = await runWithComponentRenderContext(
			{
				currentIntegration: input.currentIntegrationName,
				boundaryContext: input.callbacks.getComponentRenderBoundaryContext(),
			},
			async () =>
				input.callbacks.renderPageComponent({
					component: input.Page,
					props: {
						...input.props,
						params: input.routeOptions.params || {},
						query: input.routeOptions.query || {},
					},
				}),
		);

		return execution.value;
	}

	/**
	 * Builds the runtime assets needed to bootstrap global lazy trigger execution.
	 *
	 * @param triggers Fully resolved lazy trigger definitions.
	 * @returns Processed assets that should be merged into the final dependency set.
	 */
	private async buildGlobalInjectorAssets(
		triggers: ResolvedLazyTrigger[],
		currentIntegrationName: string,
	): Promise<ProcessedAsset[]> {
		const globalInjectorImportPath = coreRequire.resolve('@ecopages/scripts-injector/global');
		const globalInjectorRuntimeAsset = AssetFactory.createNodeModuleScript({
			position: 'head',
			name: 'ecopages-scripts-injector-global',
			importPath: globalInjectorImportPath,
			excludeFromHtml: true,
		});

		const [globalInjectorRuntimeProcessed] = await this.assetProcessingService.processDependencies(
			[globalInjectorRuntimeAsset],
			currentIntegrationName,
		);

		const globalInjectorModuleUrl = globalInjectorRuntimeProcessed?.srcUrl;
		if (!globalInjectorModuleUrl) {
			throw new Error('[ecopages] Failed to resolve global injector runtime asset URL.');
		}

		const mapScript = AssetFactory.createInlineContentScript({
			position: 'head',
			name: 'ecopages-global-injector-map',
			content: buildGlobalInjectorMapScript(triggers),
			attributes: { type: 'ecopages/global-injector-map' },
			bundle: false,
		});
		const bootstrapScript = AssetFactory.createContentScript({
			position: 'head',
			name: 'ecopages-global-injector-bootstrap',
			content: buildGlobalInjectorBootstrapContent(globalInjectorModuleUrl),
			attributes: { type: 'module' },
			bundle: false,
		});

		return this.assetProcessingService.processDependencies(
			[mapScript, bootstrapScript, globalInjectorRuntimeAsset],
			currentIntegrationName,
		);
	}

	private async buildEagerSsrLazyAssets(
		components: (EcoComponent | Partial<EcoComponent>)[],
		currentIntegrationName: string,
	): Promise<ProcessedAsset[]> {
		const dependencies = this.collectEagerSsrLazyDependencies(components);
		if (dependencies.length === 0) {
			return [];
		}

		return this.assetProcessingService.processDependencies(dependencies, `${currentIntegrationName}:ssr-lazy`);
	}

	private collectEagerSsrLazyDependencies(
		components: (EcoComponent | Partial<EcoComponent>)[],
	): ReturnType<AssetProcessingService['processDependencies']> extends Promise<infer _>
		? Parameters<AssetProcessingService['processDependencies']>[0]
		: never {
		const dependencies = [] as Parameters<AssetProcessingService['processDependencies']>[0];
		const visitedConfigs = new Set<EcoComponentConfig>();
		const seenKeys = new Set<string>();

		const normalizeAttributes = (attributes?: DependencyAttributes) => ({
			type: 'module',
			defer: '',
			...(attributes ?? {}),
		});

		const collect = (config?: EcoComponentConfig) => {
			if (!config || visitedConfigs.has(config)) {
				return;
			}

			visitedConfigs.add(config);

			const componentFile = config.__eco?.file;
			if (componentFile) {
				const componentDir = coreRequire('node:path').dirname(componentFile);
				for (const script of config.dependencies?.scripts ?? []) {
					if (typeof script === 'string' || !script.lazy || script.ssr !== true) {
						continue;
					}

					const attributes = normalizeAttributes(script.attributes);

					if (script.content) {
						const key = `content:${script.content}:${JSON.stringify(attributes)}`;
						if (seenKeys.has(key)) {
							continue;
						}

						seenKeys.add(key);
						dependencies.push(
							AssetFactory.createContentScript({
								position: 'head',
								content: script.content,
								attributes,
							}),
						);
						continue;
					}

					if (!script.src) {
						continue;
					}

					const resolvedPath = coreRequire('node:path').resolve(componentDir, script.src);
					const key = `file:${resolvedPath}:${JSON.stringify(attributes)}`;
					if (seenKeys.has(key)) {
						continue;
					}

					seenKeys.add(key);
					dependencies.push(
						AssetFactory.createFileScript({
							filepath: resolvedPath,
							position: 'head',
							attributes,
						}),
					);
				}
			}

			if (config.layout?.config) {
				collect(config.layout.config);
			}

			for (const nestedComponent of config.dependencies?.components ?? []) {
				collect(nestedComponent?.config);
			}
		};

		for (const component of components) {
			collect(component.config);
		}

		return dependencies;
	}
}
