import { createRequire } from 'node:module';
import path from 'node:path';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type {
	ComponentRenderResult,
	DependencyAttributes,
	EcoComponent,
	EcoComponentConfig,
	EcoPageComponent,
	EcoPageFile,
	EcoPagesElement,
	GetMetadata,
	GetStaticProps,
	HtmlTemplateProps,
	IntegrationRendererRenderOptions,
	PageMetadataProps,
	PageProps,
	ResolvedLazyTrigger,
	RouteRendererBody,
	RouteRendererOptions,
	RouteRenderResult,
} from '../../types/public-types.ts';
import {
	type AssetProcessingService,
	AssetFactory,
	createPagePackage,
	type ProcessedAsset,
} from '../../services/assets/asset-processing-service/index.ts';
import { buildGlobalInjectorBootstrapContent, buildGlobalInjectorMapScript } from '../../eco/global-injector-map.ts';
import { LocalsAccessError } from '../../errors/locals-access-error.ts';
import { inspectBoundaryArtifactHtml } from './render-output.utils.ts';
import { BoundaryOwnershipValidationService } from './boundary-ownership-validation.service.ts';
import { BoundaryPlanningService } from './boundary-planning.service.ts';
import { dedupeProcessedAssets } from './processed-asset-dedupe.ts';

type ResolvedPageModule = {
	Page: EcoPageFile['default'] | EcoPageComponent<any>;
	getStaticProps?: GetStaticProps<Record<string, unknown>>;
	getMetadata?: GetMetadata;
	integrationSpecificProps: Record<string, unknown>;
};

function createPageLocalsProxy(filePath: string): Record<string, never> {
	const errorMessage = `[ecopages] Request locals are only available during request-time rendering with cache: 'dynamic'. Page: ${filePath}. If you meant to use locals here, set cache: 'dynamic' and provide locals from route middleware/handlers.`;

	return new Proxy(
		{},
		{
			get: () => {
				throw new LocalsAccessError(errorMessage);
			},
			set: () => {
				throw new LocalsAccessError(errorMessage);
			},
			has: () => {
				throw new LocalsAccessError(errorMessage);
			},
			ownKeys: () => {
				throw new LocalsAccessError(errorMessage);
			},
			deleteProperty: () => {
				throw new LocalsAccessError(errorMessage);
			},
			defineProperty: () => {
				throw new LocalsAccessError(errorMessage);
			},
			getOwnPropertyDescriptor: () => {
				throw new LocalsAccessError(errorMessage);
			},
		},
	);
}

export interface RouteRenderFlowCallbacks<C> {
	/**
	 * Loads the owning page module and normalizes integration-facing exports.
	 */
	resolvePageModule(file: string): Promise<ResolvedPageModule>;
	/**
	 * Returns the active document shell component for the render.
	 */
	getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>>;
	/**
	 * Resolves page props and metadata for the current route inputs.
	 */
	resolvePageData(
		pageModule: {
			getStaticProps?: GetStaticProps<Record<string, unknown>>;
			getMetadata?: GetMetadata;
		},
		routeOptions: RouteRendererOptions,
	): Promise<{ props: Record<string, unknown>; metadata: PageMetadataProps }>;
	/**
	 * Resolves declared component dependencies into processed assets.
	 */
	resolveDependencies(components: (EcoComponent | Partial<EcoComponent>)[]): Promise<ProcessedAsset[]>;
	/**
	 * Builds route-owned assets such as the page browser entry for the current file.
	 */
	buildRouteRenderAssets(file: string): Promise<ProcessedAsset[]> | undefined;
	/**
	 * Controls whether the page root should be rendered through the component contract during preparation.
	 */
	shouldRenderPageComponent(input: {
		Page: EcoComponent;
		Layout?: EcoComponent;
		options: RouteRendererOptions;
	}): boolean;
	/**
	 * Renders the page root through the component boundary contract.
	 */
	renderPageComponent(input: {
		component: EcoComponent;
		props: Record<string, unknown>;
	}): Promise<ComponentRenderResult>;
	/**
	 * Executes the integration-specific route render.
	 */
	render(renderOptions: IntegrationRendererRenderOptions<C>): Promise<RouteRendererBody>;
	/**
	 * Returns document-level attributes that should be stamped onto the final html element.
	 */
	getDocumentAttributes(renderOptions: IntegrationRendererRenderOptions<C>): Record<string, string> | undefined;
	/**
	 * Applies attributes to the final html element.
	 */
	applyAttributesToHtmlElement(html: string, attributes: Record<string, string>): string;
	/**
	 * Applies attributes to the first rendered body/root element.
	 */
	applyAttributesToFirstBodyElement(html: string, attributes: Record<string, string>): string;
	/**
	 * Runs final HTML transformation and returns the body value exposed to callers.
	 */
	transformResponse(response: Response): Promise<RouteRendererBody>;
	/**
	 * Observes the prepared route render options before execution continues.
	 */
	onPreparedRenderOptions?(renderOptions: IntegrationRendererRenderOptions<C>): void;
}

/**
 * Captured route-render output in both replayable body and string HTML forms.
 */
export interface CapturedHtmlRenderResult {
	body: RouteRendererBody;
	html: string;
}

/**
 * Final HTML stamping inputs applied after route rendering completes.
 */
export interface FinalizeHtmlRenderOptions {
	html: string;
	componentRootAttributes?: Record<string, string>;
	documentAttributes?: Record<string, string>;
}

/**
 * Optional app-scoped collaborators used by the route render flow.
 */
export interface RouteRenderFlowDependencies {
	boundaryPlanningService?: BoundaryPlanningService;
	boundaryOwnershipValidationService?: BoundaryOwnershipValidationService;
}

/**
 * Owns one route render from normalized module loading through final HTML output.
 *
 * This flow keeps route rendering as one app-scoped orchestration unit while
 * still delegating integration-specific behavior through callbacks. It owns
 * route-root validation, dependency aggregation, page package creation, and the
 * final HTML/body handling that happens after the integration render returns.
 */
export class RouteRenderFlow {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly assetProcessingService: AssetProcessingService;
	private readonly boundaryPlanningService: BoundaryPlanningService;
	private readonly boundaryOwnershipValidationService: BoundaryOwnershipValidationService;

	constructor(
		appConfig: EcoPagesAppConfig,
		assetProcessingService: AssetProcessingService,
		dependencies: RouteRenderFlowDependencies = {},
	) {
		this.appConfig = appConfig;
		this.assetProcessingService = assetProcessingService;
		this.boundaryPlanningService = dependencies.boundaryPlanningService ?? new BoundaryPlanningService();
		this.boundaryOwnershipValidationService =
			dependencies.boundaryOwnershipValidationService ?? new BoundaryOwnershipValidationService(appConfig);
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
		currentIntegrationName: string,
		callbacks: RouteRenderFlowCallbacks<C>,
	): Promise<IntegrationRendererRenderOptions<C>> {
		const pageModule = await callbacks.resolvePageModule(routeOptions.file);
		const { Page, integrationSpecificProps } = pageModule;
		const HtmlTemplate = await callbacks.getHtmlTemplate();
		const Layout = Page.config?.layout;
		const validationErrors = this.boundaryOwnershipValidationService.validate({
			currentIntegrationName,
			roots: [
				{ component: HtmlTemplate as EcoComponent, source: 'html-template' },
				...(Layout ? [{ component: Layout as EcoComponent, source: 'layout' as const }] : []),
				{ component: Page as EcoComponent, source: 'page' },
			],
		});
		const { props, metadata } = await callbacks.resolvePageData(pageModule, routeOptions);
		const boundaryPlan = this.boundaryPlanningService.buildPlan({
			routeFile: routeOptions.file,
			currentIntegrationName,
			HtmlTemplate: HtmlTemplate as EcoComponent,
			Layout,
			Page: Page as EcoComponent,
			validationErrors,
		});

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
			const pageRootRender = await this.renderPageRoot({
				Page: Page as EcoComponent,
				props,
				routeOptions,
				callbacks,
			});
			componentRender = pageRootRender.componentRender;

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

		const dedupedDependencies = dedupeProcessedAssets(allDependencies);
		const pagePackage = createPagePackage(dedupedDependencies);
		const pageProps = {
			...props,
			params: routeOptions.params || {},
			query: routeOptions.query || {},
		};
		const cacheStrategy = (Page as EcoPageComponent<any>).cache;
		const defaultCacheStrategy = this.appConfig.cache?.defaultStrategy ?? 'static';
		const effectiveCacheStrategy = cacheStrategy ?? defaultCacheStrategy;
		const localsAvailable = effectiveCacheStrategy === 'dynamic' && routeOptions.locals !== undefined;

		const pageLocals = localsAvailable
			? routeOptions.locals!
			: (createPageLocalsProxy(routeOptions.file) as RouteRendererOptions['locals']);

		const locals = localsAvailable ? routeOptions.locals : undefined;
		const preparedOptions: IntegrationRendererRenderOptions<C> = {
			...routeOptions,
			resolvedDependencies,
			pagePackage,
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
			boundaryPlan,
		};

		callbacks.onPreparedRenderOptions?.(preparedOptions);

		return {
			...integrationSpecificProps,
			...preparedOptions,
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
		currentIntegrationName: string,
		callbacks: RouteRenderFlowCallbacks<C>,
	): Promise<RouteRenderResult> {
		const renderOptions = await this.prepareRenderOptions(options, currentIntegrationName, callbacks);
		const shouldApplyComponentRootAttributes =
			renderOptions.componentRender?.canAttachAttributes &&
			renderOptions.componentRender.rootAttributes &&
			Object.keys(renderOptions.componentRender.rootAttributes).length > 0;

		const renderExecution = await this.captureHtmlRender(async () => callbacks.render(renderOptions));
		const boundaryArtifacts = inspectBoundaryArtifactHtml(renderExecution.html);
		const documentAttributes = callbacks.getDocumentAttributes(renderOptions);
		const hasBoundaryMarkerHtml = boundaryArtifacts.hasUnresolvedBoundaryArtifacts;

		if (hasBoundaryMarkerHtml) {
			throw new Error(
				'[ecopages] Route render returned unresolved boundary artifact HTML. Full-route unresolved-boundary fallback has been removed; resolve mixed boundaries inside renderComponentBoundary().',
			);
		}

		const canReuseCapturedBody =
			!hasBoundaryMarkerHtml &&
			!shouldApplyComponentRootAttributes &&
			!(documentAttributes && Object.keys(documentAttributes).length > 0);

		if (canReuseCapturedBody) {
			const body = await callbacks.transformResponse(
				new Response(renderExecution.body as BodyInit, {
					headers: {
						'Content-Type': 'text/html',
					},
				}),
			);

			return {
				body,
				cacheStrategy: renderOptions.cacheStrategy,
			};
		}

		const finalization = await this.finalizeHtmlRender(
			{
				html: boundaryArtifacts.normalizedHtml,
				componentRootAttributes: shouldApplyComponentRootAttributes
					? (renderOptions.componentRender?.rootAttributes as Record<string, string>)
					: undefined,
				documentAttributes,
			},
			{
				applyAttributesToHtmlElement: callbacks.applyAttributesToHtmlElement,
				applyAttributesToFirstBodyElement: callbacks.applyAttributesToFirstBodyElement,
			},
		);

		const body = await callbacks.transformResponse(
			new Response(finalization, {
				headers: {
					'Content-Type': 'text/html',
				},
			}),
		);

		return {
			body,
			cacheStrategy: renderOptions.cacheStrategy,
		};
	}

	/**
	 * Applies final root and document attributes after the route HTML is fully resolved.
	 */
	async finalizeHtmlRender(
		options: FinalizeHtmlRenderOptions,
		callbacks: Pick<
			RouteRenderFlowCallbacks<unknown>,
			'applyAttributesToHtmlElement' | 'applyAttributesToFirstBodyElement'
		>,
	): Promise<string> {
		return this.applyFinalHtmlAttributes(options.html, options, callbacks);
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

	private applyFinalHtmlAttributes(
		html: string,
		options: FinalizeHtmlRenderOptions,
		callbacks: Pick<
			RouteRenderFlowCallbacks<unknown>,
			'applyAttributesToHtmlElement' | 'applyAttributesToFirstBodyElement'
		>,
	): string {
		let renderedHtml = html;

		if (options.componentRootAttributes && Object.keys(options.componentRootAttributes).length > 0) {
			renderedHtml = callbacks.applyAttributesToFirstBodyElement(renderedHtml, options.componentRootAttributes);
		}

		if (options.documentAttributes && Object.keys(options.documentAttributes).length > 0) {
			renderedHtml = callbacks.applyAttributesToHtmlElement(renderedHtml, options.documentAttributes);
		}

		return renderedHtml;
	}

	private collectResolvedTriggers(
		components: (EcoComponent | Partial<EcoComponent>)[],
		seen = new Set<object>(),
	): ResolvedLazyTrigger[] {
		const triggers: ResolvedLazyTrigger[] = [];
		for (const comp of components) {
			if (!comp) {
				continue;
			}

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

	private collectIntegrationNames(
		components: (EcoComponent | Partial<EcoComponent>)[],
		seen = new Set<object>(),
	): Set<string> {
		const integrationNames = new Set<string>();

		for (const comp of components) {
			if (!comp) {
				continue;
			}

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

	private async renderPageRoot(input: {
		Page: EcoComponent;
		props: Record<string, unknown>;
		routeOptions: RouteRendererOptions;
		callbacks: RouteRenderFlowCallbacks<unknown>;
	}): Promise<{ componentRender: ComponentRenderResult }> {
		return {
			componentRender: await input.callbacks.renderPageComponent({
				component: input.Page,
				props: {
					...input.props,
					params: input.routeOptions.params || {},
					query: input.routeOptions.query || {},
				},
			}),
		};
	}

	private async buildGlobalInjectorAssets(
		triggers: ResolvedLazyTrigger[],
		currentIntegrationName: string,
	): Promise<ProcessedAsset[]> {
		const globalInjectorImportPath = createRequire(import.meta.url).resolve('@ecopages/scripts-injector/global');

		const mapScript = AssetFactory.createInlineContentScript({
			position: 'head',
			name: 'ecopages-global-injector-map',
			content: buildGlobalInjectorMapScript(triggers),
			attributes: { type: 'ecopages/global-injector-map' },
			packageRole: 'keep-separate',
			bundle: false,
		});
		const bootstrapInlineScript = AssetFactory.createInlineContentScript({
			position: 'head',
			name: 'ecopages-global-injector-bootstrap',
			content: buildGlobalInjectorBootstrapContent(globalInjectorImportPath),
			attributes: { type: 'module' },
			packageRole: 'keep-separate',
			bundle: true,
		});

		return this.assetProcessingService.processDependencies(
			[mapScript, bootstrapInlineScript],
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
				const componentDir = path.dirname(componentFile);
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
								packageRole: 'dynamic-chunk',
							}),
						);
						continue;
					}

					if (!script.src) {
						continue;
					}

					const resolvedPath = path.resolve(componentDir, script.src);
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
							packageRole: 'dynamic-chunk',
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