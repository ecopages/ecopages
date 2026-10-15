/**
 * React IntegrationRenderer orchestrator.
 *
 * @remarks
 * Wires services and delegates SSR / layout composition / ownership details to
 * focused modules under `render/`. Prefer changing those modules for
 * implementation work; keep this file as the IntegrationRenderer seam.
 *
 * @module
 */

import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoComponentConfig,
	EcoPageFile,
	IntegrationRendererRenderOptions,
} from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import { buildIslandHostAttributes, getComponentIdentity } from '@ecopages/core';
import {
	createIntegrationRenderer,
	type IntegrationRendererHookFactory,
	type IntegrationRendererHooks,
	type IntegrationRendererOptions,
	type HtmlDocumentContribution,
	type HtmlDocumentContributionContext,
	type PageBrowserGraphContributionContext,
	selectHydrationIslandEntries,
	type PageClientBrowserAssets,
	type PageClientBuildEntry,
	type PageClientPlan,
} from '@ecopages/core/route-renderer/orchestration/integration-renderer';
import type { AssetDefinition, ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import { ECO_DOCUMENT_OWNER_ATTRIBUTE } from '@ecopages/core/router/navigation-coordinator';
import { resolveQueuedTokens } from '@ecopages/core/route-renderer/orchestration/foreign-child/foreign-subtree-execution.service';
import { ensurePageConfigLayouts } from '@ecopages/core/eco/page-layout-normalization';
import type { ReactNode } from 'react';
import { hasSingleRootElement } from './html-boundary.ts';
import { getIslandComponentKey } from '../hydration/hydration-asset.ts';
import { REACT_PLUGIN_NAME } from '../plugin/react.constants.ts';
import type { ReactRendererConfig } from '../plugin/react.types.ts';
import type { ReactRouterAdapter } from '../contracts/router-adapter.ts';
import { BundleService } from '../bundling/bundle.ts';
import { HmrPageMetadataCache } from '../hmr/page-metadata-cache.ts';
import { MdxConfigDependencyService } from '../mdx/mdx-config-dependency.ts';
import { PageModuleService } from '../page/page-module.ts';
import { PagePayloadService } from '../hydration/page-payload.ts';
import { HydrationAssetService } from '../hydration/hydration-asset.ts';
import {
	type DocumentShellComposeChildrenContext,
	type DocumentShellComposeChildrenResult,
	type DocumentShellLayoutInput,
} from '@ecopages/core/route-renderer/orchestration/document-shell/document-shell-render.service';
import type { QueuedForeignSubtreeResolutionContext } from '@ecopages/core/route-renderer/orchestration/foreign-child/foreign-subtree-execution.service';
import { asNonReactShellComponent, getComponentRequires, isReactManagedComponent } from './component-ownership.ts';
import {
	buildHydrationProps,
	renderComponentHtml,
	renderNonReactShellComponent,
	restoreRuntimeChildHtml,
	toReactNode,
	type ReactComponentRenderContext,
	type ReactForeignSubtreeResolutionContext,
} from './component-ssr.ts';
import { BundleError, ReactRenderError } from './errors.ts';
import { resolveReactRuntimeModules, type ReactRuntimeModules } from './react-runtime.ts';
import { composeReactLayoutPageTree, shouldUseUnifiedReactLayoutComposition } from './unified-layout-composition.ts';
import { assertComposablePage, resolveLayoutContextFromShell } from './layout-compose.ts';

export type { ReactRendererConfig } from '../plugin/react.types.ts';
export { BundleError, ReactRenderError } from './errors.ts';

export type ReactRendererOptions = IntegrationRendererOptions & {
	reactConfig?: ReactRendererConfig;
};

type ReactRendererRuntimeState = {
	routerAdapter?: ReactRouterAdapter;
	mdxExtensions: string[];
	hmrPageMetadataCache?: HmrPageMetadataCache;
	forceBrowserGraph: boolean;
	bundleService: BundleService;
	pageModuleService: PageModuleService;
	hydrationAssetService: HydrationAssetService;
	pagePayloadService: PagePayloadService;
	mdxConfigDependencyService: MdxConfigDependencyService;
	applyPendingLazyTriggers: (
		assets: ProcessedAsset[],
		configs: PageClientPlan['lazyConfigs'],
	) => PageClientBrowserAssets['lazyTriggers'];
};

type ReactRendererRuntimeStateRef = {
	current?: ReactRendererRuntimeState;
};

type ReactRendererHookTargets = Pick<
	IntegrationRendererHooks,
	| 'buildIslandClientAssets'
	| 'collectAppBrowserClientBuildEntries'
	| 'renderComponent'
	| 'renderQueuedChildren'
	| 'normalizePageModule'
	| 'collectPageBrowserGraphContribution'
	| 'composeChildren'
	| 'documentContributions'
	| 'documentAttributes'
	| 'documentShellProps'
>;

const ReactIntegrationRenderer = createIntegrationRenderer<ReactNode>(REACT_PLUGIN_NAME);

/** Renderer adapter that contributes React-specific behavior through core hooks. */
export class ReactRenderer extends ReactIntegrationRenderer {
	private reactRuntimeModules?: ReactRuntimeModules;
	private readonly runtimeStateRef: ReactRendererRuntimeStateRef;
	private readonly hookTargets: Partial<ReactRendererHookTargets>;

	constructor(options: ReactRendererOptions) {
		const { reactConfig, ...rendererOptions } = options;
		const runtimeStateRef: ReactRendererRuntimeStateRef = {};
		const hookTargets: Partial<ReactRendererHookTargets> = {};
		const configuredHooks = createReactRendererHookFactory(reactConfig, runtimeStateRef, hookTargets);
		const additionalHooks = rendererOptions.hooks;
		const hooks: IntegrationRendererHookFactory = (factoryOptions) => {
			const reactHooks = configuredHooks(factoryOptions);
			const customHooks =
				typeof additionalHooks === 'function'
					? additionalHooks({ ...factoryOptions, hooks: reactHooks })
					: additionalHooks;
			return { ...reactHooks, ...customHooks };
		};

		super({ ...rendererOptions, hooks });

		this.runtimeStateRef = runtimeStateRef;
		this.hookTargets = hookTargets;
		this.hookTargets.buildIslandClientAssets = (plan) => this.buildPageClientBrowserAssetsHook(plan);
		this.hookTargets.collectAppBrowserClientBuildEntries = (plan) =>
			this.collectAppBrowserClientBuildEntriesHook(plan);
		this.hookTargets.renderComponent = (input) => this.renderComponentHook(input);
		this.hookTargets.renderQueuedChildren = (children, runtimeContext, queuedResolutionsByToken, resolveToken) =>
			this.renderQueuedChildrenHook(children, runtimeContext, queuedResolutionsByToken, resolveToken);
		this.hookTargets.normalizePageModule = (file, module) => this.normalizeImportedPageFileHook(file, module);
		this.hookTargets.collectPageBrowserGraphContribution = (context) =>
			this.collectPageBrowserGraphContributionHook(context);
		this.hookTargets.composeChildren = ({ page, layouts, foreignChildRoots }) =>
			this.resolveComposeChildren({ page, shellLayouts: layouts, foreignChildRoots });
		this.hookTargets.documentShellProps = (renderOptions) => this.buildDocumentShellProps(renderOptions);
		this.hookTargets.documentContributions = (context) => this.getHtmlDocumentContributionsHook(context);
		this.hookTargets.documentAttributes = (renderOptions) => this.getDocumentAttributesHook(renderOptions);
	}

	get routerAdapter(): ReactRouterAdapter | undefined {
		return this.getRuntimeState().routerAdapter;
	}

	get mdxExtensions(): string[] {
		return this.getRuntimeState().mdxExtensions;
	}

	get hmrPageMetadataCache(): HmrPageMetadataCache | undefined {
		return this.getRuntimeState().hmrPageMetadataCache;
	}

	get forceBrowserGraph(): boolean {
		return this.getRuntimeState().forceBrowserGraph;
	}

	get bundleService(): BundleService {
		return this.getRuntimeState().bundleService;
	}

	get pageModuleService(): PageModuleService {
		return this.getRuntimeState().pageModuleService;
	}

	get hydrationAssetService(): HydrationAssetService {
		return this.getRuntimeState().hydrationAssetService;
	}

	get pagePayloadService(): PagePayloadService {
		return this.getRuntimeState().pagePayloadService;
	}

	get mdxConfigDependencyService(): MdxConfigDependencyService {
		return this.getRuntimeState().mdxConfigDependencyService;
	}

	private getRuntimeState(): ReactRendererRuntimeState {
		if (!this.runtimeStateRef.current) {
			throw new Error('React renderer services were used before hook initialization.');
		}

		return this.runtimeStateRef.current;
	}

	/**
	 * Builds React island and lazy-entry modules in one grouped browser build.
	 */
	private async buildPageClientBrowserAssetsHook(plan: PageClientPlan): Promise<PageClientBrowserAssets> {
		const result = await this.hydrationAssetService.buildPageClientRenderAssets({
			islands: selectHydrationIslandEntries(plan, this.name).map((entry) => ({
				file: entry.file,
				config: entry.component.config,
			})),
			lazyEntries: plan.lazyClientEntries,
		});
		const lazyTriggers = this.getRuntimeState().applyPendingLazyTriggers(
			result.processedAssets,
			plan.lazyConfigs ?? [],
		);
		return {
			processedAssets: result.processedAssets,
			islandRenderAssetsByFile: result.assetsByFile,
			lazyTriggers,
		};
	}

	private async collectAppBrowserClientBuildEntriesHook(plan: PageClientPlan): Promise<PageClientBuildEntry[]> {
		return this.hydrationAssetService.collectAppBrowserClientBuildEntries(
			selectHydrationIslandEntries(plan, this.name).map((entry) => ({
				file: entry.file,
				config: entry.component.config,
			})),
		);
	}

	private getRouterDocumentAttributes(): Record<string, string> | undefined {
		if (!this.routerAdapter) {
			return undefined;
		}

		return {
			[ECO_DOCUMENT_OWNER_ATTRIBUTE]: 'react-router',
		};
	}

	protected resolveReactRuntimeModules(): ReactRuntimeModules {
		return resolveReactRuntimeModules(this.appConfig.rootDir);
	}

	private getReactRuntimeModules(): ReactRuntimeModules {
		this.reactRuntimeModules ??= this.resolveReactRuntimeModules();
		return this.reactRuntimeModules;
	}

	private resolveReactQueuedForeignSubtreeHtml(
		html: string,
		runtimeContext: ReactForeignSubtreeResolutionContext | undefined,
	): Promise<{ assets: ProcessedAsset[]; html: string }> {
		return this.resolveQueuedForeignSubtrees(
			html,
			runtimeContext,
			async (children, currentRuntimeContext, queuedResolutionsByToken, resolveToken) => ({
				html: await this.renderQueuedChildrenToHtml({
					children,
					runtimeContext: currentRuntimeContext,
					queuedResolutionsByToken,
					resolveToken,
				}),
			}),
		);
	}

	private async renderQueuedChildrenToHtml(options: {
		children: unknown;
		runtimeContext: ReactForeignSubtreeResolutionContext;
		queuedResolutionsByToken: Map<string, ReactForeignSubtreeResolutionContext['queuedResolutions'][number]>;
		resolveToken: (token: string) => Promise<string>;
	}): Promise<string | undefined> {
		const { children, runtimeContext, queuedResolutionsByToken, resolveToken } = options;
		if (children === undefined) {
			return undefined;
		}

		const { react, reactDomServer } = this.getReactRuntimeModules();
		let html = this.normalizeUnresolvedMarkerArtifactHtml(
			reactDomServer.renderToString(react.createElement(react.Fragment, null, toReactNode(children, this.name))),
		);
		html = restoreRuntimeChildHtml(html, runtimeContext);

		return await resolveQueuedTokens(html, queuedResolutionsByToken, resolveToken);
	}

	private buildPagePayload<C>(options: {
		Page: IntegrationRendererRenderOptions<C>['Page'];
		pageProps?: IntegrationRendererRenderOptions<C>['pageProps'];
		params: IntegrationRendererRenderOptions<C>['params'];
		query: IntegrationRendererRenderOptions<C>['query'];
		locals: IntegrationRendererRenderOptions<C>['locals'];
		pagePackage?: IntegrationRendererRenderOptions<C>['pagePackage'];
	}): { pageModuleUrl: string | undefined; pageProps: Record<string, unknown> } {
		const safeLocals = this.pagePayloadService.getSerializableLocals(
			options.locals,
			getComponentRequires(options.Page),
		);

		return {
			pageModuleUrl: this.pagePayloadService.resolvePageModuleUrl(options.pagePackage, {
				routerEnabled: Boolean(this.routerAdapter),
			}),
			pageProps: this.pagePayloadService.buildSerializedPageProps({
				pageProps: options.pageProps,
				params: options.params,
				query: options.query,
				safeLocals,
			}),
		};
	}

	/**
	 * Renders a React component for component-level orchestration.
	 *
	 * Behavior:
	 * - SSR always returns the component's own root HTML (no synthetic wrapper).
	 * - When an explicit component instance id is provided, a stable
	 *   `data-eco-component-id` attribute is attached so island hydration can target it.
	 * - Without an explicit instance id, component renders remain plain SSR output.
	 * - When resolved child HTML is provided, that foreign subtree is treated as a pure SSR
	 *   composition step and does not emit hydration assets for the parent wrapper.
	 *
	 * This preserves DOM shape for global CSS/layout selectors while keeping a
	 * deterministic mount target per component instance.
	 */
	private async renderComponentHook(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		if (!isReactManagedComponent(input.component, this.name)) {
			return await this.renderForeignComponentWithSerializedHtml(input);
		}

		const runtimeContext = this.getQueuedForeignSubtreeContext<ReactForeignSubtreeResolutionContext>(input);
		return await this.renderReactManagedComponent(input, runtimeContext);
	}

	private async renderForeignComponentWithSerializedHtml(
		input: ComponentRenderInput,
	): Promise<ComponentRenderResult> {
		let props = input.props;
		if (input.children !== undefined) {
			props = {
				...input.props,
				children: typeof input.children === 'string' ? input.children : String(input.children ?? ''),
			};
		}

		const html = await renderNonReactShellComponent(
			asNonReactShellComponent<Record<string, unknown>>(input.component),
			props,
			'Component',
		);
		const assets = input.component.config?.dependencies
			? await this.processComponentDependencies([input.component])
			: undefined;

		return {
			html,
			canAttachAttributes: true,
			integrationName: this.name,
			assets,
		};
	}

	/**
	 * Emits a server island host only for eligible, single-root component renders.
	 *
	 * @remarks
	 * Renderer-owned services stay on this class so SSR helpers do not receive
	 * wrappers around the renderer's own methods.
	 */
	private async renderReactManagedComponent(
		input: ComponentRenderInput,
		runtimeContext: ReactForeignSubtreeResolutionContext | undefined,
	): Promise<ComponentRenderResult> {
		const componentConfig = input.component.config;
		const context: ReactComponentRenderContext = {
			componentInstanceId: input.integrationContext?.componentInstanceId,
		};
		const hasResolvedChildHtml = input.children !== undefined;
		let html = this.normalizeUnresolvedMarkerArtifactHtml(
			renderComponentHtml({ input, context, runtimeContext, runtime: this.getReactRuntimeModules() }),
		);
		const queuedResolution = await this.resolveReactQueuedForeignSubtreeHtml(html, runtimeContext);
		html = queuedResolution.html;
		const canAttachAttributes = hasSingleRootElement(html);
		const componentFile = getComponentIdentity(componentConfig)?.file;

		let rootAttributes: Record<string, string> | undefined;
		let assets: ProcessedAsset[] | undefined;
		if (canAttachAttributes && componentFile && context.componentInstanceId && !hasResolvedChildHtml) {
			rootAttributes = buildIslandHostAttributes({
				integrationName: this.name,
				componentInstanceId: context.componentInstanceId,
				componentKey: getIslandComponentKey(componentFile, componentConfig),
				props: buildHydrationProps(input.props),
			});
			assets = this.getActiveIslandRenderAssets().get(componentFile);
			html = `<eco-island style="display:contents">${html}</eco-island>`;
		}
		const mergedAssets = this.htmlTransformer.dedupeProcessedAssets([
			...(assets ?? []),
			...queuedResolution.assets,
		]);

		return {
			html,
			canAttachAttributes,
			integrationName: this.name,
			rootAttributes,
			assets: mergedAssets.length > 0 ? mergedAssets : undefined,
		};
	}

	private async renderQueuedChildrenHook(
		children: unknown,
		runtimeContext: QueuedForeignSubtreeResolutionContext,
		queuedResolutionsByToken: Map<string, QueuedForeignSubtreeResolutionContext['queuedResolutions'][number]>,
		resolveToken: (token: string) => Promise<string>,
	): Promise<{ html?: string }> {
		if (children === undefined) {
			return {};
		}

		const html = await this.renderQueuedChildrenToHtml({
			children,
			runtimeContext: runtimeContext as ReactForeignSubtreeResolutionContext,
			queuedResolutionsByToken,
			resolveToken,
		});
		return html === undefined ? {} : { html };
	}

	/**
	 * Checks if the given file path corresponds to an MDX file based on configured extensions.
	 * @param filePath - The file path to check
	 * @returns True if the file is an MDX file
	 */
	public isMdxFile(filePath: string): boolean {
		return this.pageModuleService.isMdxFile(filePath);
	}

	private normalizeImportedPageFileHook<TPageModule extends EcoPageFile>(
		file: string,
		pageModule: TPageModule,
	): TPageModule {
		const reactModule = pageModule as TPageModule & { config?: EcoComponentConfig };
		const { default: Page, getMetadata, config } = reactModule;

		if (this.pageModuleService.isMdxFile(file) && config) {
			ensurePageConfigLayouts(config);
			Page.config = config;
		}

		return {
			...pageModule,
			default: Page,
			getMetadata,
			config,
		} as TPageModule;
	}

	private async collectPageBrowserGraphContributionHook(
		context: PageBrowserGraphContributionContext,
	): Promise<{ dependencies?: AssetDefinition[]; assets?: ProcessedAsset[] }> {
		try {
			const { file: pagePath, pageModule } = context;
			const shouldHydrate = this.forceBrowserGraph ? true : this.pageModuleService.shouldHydratePage(pageModule);
			if (!shouldHydrate) {
				return { assets: [] };
			}

			const isMdx = this.pageModuleService.isMdxFile(pagePath);
			const declaredModules = this.pageModuleService.collectPageDeclaredModules(pageModule);

			if (isMdx) {
				await this.bundleService.ensurePageLayoutNormalizationVendorProcessed(this.assetProcessingService);
			}

			const dependencies = await this.hydrationAssetService.createPageBrowserGraphDependencies(
				pagePath,
				isMdx,
				declaredModules,
			);
			const assets: ProcessedAsset[] = isMdx
				? await this.mdxConfigDependencyService.processMdxConfigDependencies({
						pagePath,
						config: (pageModule as EcoPageFile & { config?: EcoComponentConfig }).config,
						processComponentDependencies: async (components) =>
							await this.processComponentDependencies(components),
					})
				: [];

			return { dependencies, assets };
		} catch (error) {
			if (error instanceof BundleError) {
				console.error('[ecopages] Bundle errors:', error.logs);
			}

			throw new ReactRenderError(
				`Failed to generate hydration script: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private async composeReactLayoutPageChildrenForShell(
		page: { component: EcoComponent; props: Record<string, unknown> },
		context: DocumentShellComposeChildrenContext,
	): Promise<DocumentShellComposeChildrenResult> {
		const pageComponent = assertComposablePage(page.component);
		const shellEntries = context.layouts.map((layout) => ({
			component: layout.component,
			props: layout.props,
		}));
		const { react, reactDomServer } = this.getReactRuntimeModules();
		const tree = composeReactLayoutPageTree(pageComponent, page.props, shellEntries, {
			context: resolveLayoutContextFromShell(page.props, shellEntries),
			react,
		});
		const runtimeInput: ComponentRenderInput = {
			component: page.component,
			props: page.props,
			integrationContext: {
				rendererCache: context.rendererCache as ReactForeignSubtreeResolutionContext['rendererCache'],
			},
		};
		const runtimeContext = this.getQueuedForeignSubtreeContext<ReactForeignSubtreeResolutionContext>(runtimeInput);
		const html = this.normalizeUnresolvedMarkerArtifactHtml(reactDomServer.renderToString(tree));
		const resolved = await this.resolveReactQueuedForeignSubtreeHtml(html, runtimeContext);
		const primaryRender: ComponentRenderResult = {
			html: resolved.html,
			canAttachAttributes: hasSingleRootElement(resolved.html),
			integrationName: this.name,
			assets: resolved.assets.length > 0 ? resolved.assets : undefined,
		};

		return {
			children: resolved.html,
			layoutRenders: [],
			primaryRender,
		};
	}

	protected resolveComposeChildren(options: {
		page: { component: EcoComponent; props: Record<string, unknown> };
		shellLayouts: DocumentShellLayoutInput[];
		foreignChildRoots?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>;
	}): ((context: DocumentShellComposeChildrenContext) => Promise<DocumentShellComposeChildrenResult>) | undefined {
		const { page, shellLayouts, foreignChildRoots } = options;
		if (
			!shouldUseUnifiedReactLayoutComposition({
				page: page.component,
				shellLayouts,
				reactIntegrationName: this.name,
			})
		) {
			return undefined;
		}

		if (
			this.hasForeignChildDescendants(page.component, foreignChildRoots) ||
			shellLayouts.some((layout) => this.hasForeignChildDescendants(layout.component))
		) {
			return undefined;
		}

		return (context) => this.composeReactLayoutPageChildrenForShell(page, context);
	}

	private buildDocumentShellProps<C>(options: IntegrationRendererRenderOptions<C>): {
		pageProps: Record<string, unknown>;
		documentProps?: Record<string, unknown>;
	} {
		const pagePayload = this.buildPagePayload({
			Page: options.Page,
			pageProps: options.pageProps,
			params: options.params,
			query: options.query,
			locals: options.locals,
			pagePackage: options.pagePackage,
		});

		return {
			pageProps: pagePayload.pageProps,
			documentProps: pagePayload.pageModuleUrl ? { pageModuleUrl: pagePayload.pageModuleUrl } : undefined,
		};
	}

	private getHtmlDocumentContributionsHook<C>(
		options: HtmlDocumentContributionContext<C>,
	): HtmlDocumentContribution[] | undefined {
		const renderOptions = options.renderOptions;
		if (
			options.partial ||
			!renderOptions ||
			!this.routerAdapter ||
			isReactManagedComponent(renderOptions.HtmlTemplate, this.name)
		) {
			return undefined;
		}

		const pagePayload = this.buildPagePayload({
			Page: renderOptions.Page,
			pageProps: renderOptions.pageProps,
			params: renderOptions.params,
			query: renderOptions.query,
			locals: renderOptions.locals,
			pagePackage: renderOptions.pagePackage,
		});

		return this.pagePayloadService.buildNonReactDocumentContributions({
			htmlTemplate: renderOptions.HtmlTemplate,
			pageProps: pagePayload.pageProps,
			pageModuleUrl: pagePayload.pageModuleUrl,
			reactIntegrationName: this.name,
			routerEnabled: true,
		});
	}

	private getDocumentAttributesHook<C>(
		_renderOptions: IntegrationRendererRenderOptions<C>,
	): Record<string, string> | undefined {
		return this.getRouterDocumentAttributes();
	}
}

function createReactRendererHookFactory(
	reactConfig: ReactRendererConfig | undefined,
	runtimeStateRef: ReactRendererRuntimeStateRef,
	hookTargets: Partial<ReactRendererHookTargets>,
): IntegrationRendererHookFactory {
	return ({
		appConfig,
		assetProcessingService,
		applyPendingLazyTriggers,
	}: Parameters<IntegrationRendererHookFactory>[0]) => {
		const routerAdapter = reactConfig?.routerAdapter;
		const mdxExtensions = reactConfig?.mdxExtensions ?? ['.mdx'];
		const hmrPageMetadataCache = reactConfig?.hmrPageMetadataCache;
		const forceBrowserGraph = reactConfig?.forceBrowserGraph ?? false;
		const bundleService = new BundleService({
			rootDir: appConfig.rootDir,
			appConfig,
			hostIntegrationName: REACT_PLUGIN_NAME,
			routerAdapter,
			runtimeModules: reactConfig?.runtimeModules,
			getMdxLoaderPlugin: reactConfig?.getMdxLoaderPlugin,
		});
		const pageModuleService = new PageModuleService({
			layoutsDir: appConfig.absolutePaths.layoutsDir,
			componentsDir: appConfig.absolutePaths.componentsDir,
			mdxExtensions,
			integrationName: REACT_PLUGIN_NAME,
			hasRouterAdapter: Boolean(routerAdapter),
		});
		const hydrationAssetService = new HydrationAssetService({
			srcDir: appConfig.srcDir,
			routerAdapter,
			assetProcessingService,
			bundleService,
			hmrPageMetadataCache,
		});

		runtimeStateRef.current = {
			routerAdapter,
			mdxExtensions,
			hmrPageMetadataCache,
			forceBrowserGraph,
			bundleService,
			pageModuleService,
			hydrationAssetService,
			pagePayloadService: new PagePayloadService(),
			mdxConfigDependencyService: new MdxConfigDependencyService({
				integrationName: REACT_PLUGIN_NAME,
				pageModuleService,
				assetProcessingService,
			}),
			applyPendingLazyTriggers,
		};

		return {
			buildIslandClientAssets: (plan) =>
				requireReactRendererHookTarget(hookTargets, 'buildIslandClientAssets')(plan),
			collectAppBrowserClientBuildEntries: (plan) =>
				requireReactRendererHookTarget(hookTargets, 'collectAppBrowserClientBuildEntries')(plan),
			renderComponent: (input) => requireReactRendererHookTarget(hookTargets, 'renderComponent')(input),
			renderQueuedChildren: (children, runtimeContext, queuedResolutionsByToken, resolveToken) =>
				requireReactRendererHookTarget(hookTargets, 'renderQueuedChildren')(
					children,
					runtimeContext,
					queuedResolutionsByToken,
					resolveToken,
				),
			normalizePageModule: (file, module) =>
				requireReactRendererHookTarget(hookTargets, 'normalizePageModule')(file, module),
			collectPageBrowserGraphContribution: (context) =>
				requireReactRendererHookTarget(hookTargets, 'collectPageBrowserGraphContribution')(context),
			composeChildren: (input) => requireReactRendererHookTarget(hookTargets, 'composeChildren')(input),
			documentShellProps: <C>(options: IntegrationRendererRenderOptions<C>) =>
				requireReactRendererHookTarget(hookTargets, 'documentShellProps')(options),
			documentContributions: <C>(context: HtmlDocumentContributionContext<C>) =>
				requireReactRendererHookTarget(hookTargets, 'documentContributions')(context),
			documentAttributes: <C>(options: IntegrationRendererRenderOptions<C>) =>
				requireReactRendererHookTarget(hookTargets, 'documentAttributes')(options),
			renderRoute: async (_options, render) => {
				try {
					return await render();
				} catch (error) {
					throw createReactRenderError('Failed to render component', error);
				}
			},
		} satisfies IntegrationRendererHooks;
	};
}

function requireReactRendererHookTarget<K extends keyof ReactRendererHookTargets>(
	hookTargets: Partial<ReactRendererHookTargets>,
	name: K,
): NonNullable<ReactRendererHookTargets[K]> {
	const hookTarget = hookTargets[name];
	if (!hookTarget) {
		throw new Error(`React renderer hook "${name}" was called before the renderer was initialized.`);
	}

	return hookTarget;
}

function createReactRenderError(message: string, cause?: unknown): HttpError {
	if (HttpError.isHttpError(cause)) {
		return cause;
	}

	const errorMessage = cause instanceof Error ? `${message}: ${cause.message}` : message;
	return HttpError.InternalServerError(errorMessage);
}
