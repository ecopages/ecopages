/**
 * This module contains the React renderer
 * @module
 */

import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoComponentConfig,
	EcoPageFile,
	EcoPagesElement,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
} from '@ecopages/core';
import {
	IntegrationRenderer,
	type RenderToResponseContext,
	type RouteModuleLoadOptions,
} from '@ecopages/core/route-renderer/integration-renderer';
import { RESOLVED_ASSETS_DIR } from '@ecopages/core/constants';
import { getAppBuildExecutor } from '@ecopages/core/build/build-adapter';
import type { ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import { ECO_DOCUMENT_OWNER_ATTRIBUTE } from '@ecopages/core/router/navigation-coordinator';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { FunctionComponent, ReactNode } from 'react';
import type { CompileOptions } from '@mdx-js/mdx';
import { REACT_PLUGIN_NAME } from './react.constants.ts';
import type { ReactRendererConfig } from './react.types.ts';
import type { ReactRouterAdapter } from './router-adapter.ts';
import { hasSingleRootElement } from './utils/html-boundary.ts';
import { ReactBundleService } from './services/react-bundle.service.ts';
import { ReactHmrPageMetadataCache } from './services/react-hmr-page-metadata-cache.ts';
import { ReactMdxConfigDependencyService } from './services/react-mdx-config-dependency.service.ts';
import { ReactPageModuleService } from './services/react-page-module.service.ts';
import { ReactPagePayloadService } from './services/react-page-payload.service.ts';
import { getReactIslandComponentKey, ReactHydrationAssetService } from './services/react-hydration-asset.service.ts';

export type { ReactRendererConfig } from './react.types.ts';

type ReactComponentRenderContext = {
	componentInstanceId?: string;
};

type ReactBoundaryRuntimeContext = {
	rendererCache: Map<string, IntegrationRenderer<any>>;
	componentInstanceScope?: string;
	nextBoundaryId: number;
	queuedResolutions: Array<{
		token: string;
		component: EcoComponent;
		props: Record<string, unknown>;
		componentInstanceId: string;
	}>;
	rawChildrenToken?: string;
	rawChildrenHtml?: string;
};

type SerializableProps = Record<string, unknown>;

type ReactRenderableComponent<P extends SerializableProps = SerializableProps> = FunctionComponent<P> & {
	config?: EcoComponentConfig;
	requires?: string | readonly string[];
};

type ReactRuntimeModules = {
	react: Pick<typeof import('react'), 'createElement' | 'Fragment'>;
	reactDomServer: Pick<typeof import('react-dom/server'), 'renderToReadableStream' | 'renderToString'>;
};

type RequiresAwareComponent = {
	requires?: string | readonly string[];
};

export type ReactRendererOptions = ConstructorParameters<typeof IntegrationRenderer>[0] & {
	reactConfig?: ReactRendererConfig;
};

/**
 * Error thrown when an error occurs while rendering a React component.
 */
export class ReactRenderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ReactRenderError';
	}
}

/**
 * Error thrown when an error occurs while bundling a React component.
 */
export class BundleError extends Error {
	public readonly logs: string[];

	constructor(message: string, logs: string[]) {
		super(message);
		this.name = 'BundleError';
		this.logs = logs;
	}
}

/**
 * Renderer for React components.
 * @extends IntegrationRenderer
 */
export class ReactRenderer extends IntegrationRenderer<ReactNode> {
	name = REACT_PLUGIN_NAME;
	componentDirectory = RESOLVED_ASSETS_DIR;
	private reactRuntimeModules?: ReactRuntimeModules;
	private readonly routerAdapter?: ReactRouterAdapter;
	private readonly mdxCompilerOptions?: CompileOptions;
	private readonly mdxExtensions: string[];
	private readonly hmrPageMetadataCache?: ReactHmrPageMetadataCache;
	/**
	 * Enables explicit graph behavior for React page-entry bundling.
	 *
	 * When true, page-entry bundles disable AST server-only stripping and rely
	 * on explicit dependency declarations for browser graph composition.
	 */
	private readonly explicitGraphEnabled: boolean;

	/** @internal */
	readonly bundleService: ReactBundleService;
	/** @internal */
	readonly pageModuleService: ReactPageModuleService;
	/** @internal */
	readonly hydrationAssetService: ReactHydrationAssetService;
	/** @internal */
	readonly pagePayloadService: ReactPagePayloadService;
	/** @internal */
	readonly mdxConfigDependencyService: ReactMdxConfigDependencyService;

	constructor(options: ReactRendererOptions) {
		const { reactConfig, ...rendererOptions } = options;
		super(rendererOptions);

		this.routerAdapter = reactConfig?.routerAdapter;
		this.mdxCompilerOptions = reactConfig?.mdxCompilerOptions;
		this.mdxExtensions = reactConfig?.mdxExtensions ?? ['.mdx'];
		this.hmrPageMetadataCache = reactConfig?.hmrPageMetadataCache;
		this.explicitGraphEnabled = reactConfig?.explicitGraphEnabled ?? false;

		this.bundleService = new ReactBundleService({
			rootDir: this.appConfig.rootDir,
			routerAdapter: this.routerAdapter,
			mdxCompilerOptions: this.mdxCompilerOptions,
			jsxImportSource: (this.appConfig.integrations ?? []).find((integration) => integration.name === this.name)
				?.jsxImportSource,
			nonReactExtensions: (this.appConfig.integrations ?? [])
				.filter((integration) => integration.name !== this.name)
				.flatMap((integration) => integration.extensions),
		});

		this.pageModuleService = new ReactPageModuleService({
			rootDir: this.appConfig.rootDir,
			distDir: this.appConfig.absolutePaths.distDir,
			workDir: this.appConfig.absolutePaths.workDir,
			buildExecutor: getAppBuildExecutor(this.appConfig),
			layoutsDir: this.appConfig.absolutePaths.layoutsDir,
			componentsDir: this.appConfig.absolutePaths.componentsDir,
			mdxCompilerOptions: this.mdxCompilerOptions,
			mdxExtensions: this.mdxExtensions,
			integrationName: this.name,
			hasRouterAdapter: Boolean(this.routerAdapter),
		});

		this.hydrationAssetService = new ReactHydrationAssetService({
			srcDir: this.appConfig.srcDir,
			routerAdapter: this.routerAdapter,
			assetProcessingService: this.assetProcessingService,
			bundleService: this.bundleService,
			hmrPageMetadataCache: this.hmrPageMetadataCache,
		});

		this.pagePayloadService = new ReactPagePayloadService();
		this.mdxConfigDependencyService = new ReactMdxConfigDependencyService({
			integrationName: this.name,
			pageModuleService: this.pageModuleService,
			assetProcessingService: this.assetProcessingService,
		});
	}

	protected override shouldRenderPageComponent(): boolean {
		return false;
	}

	/**
	 * Reads the declared integration name for a component or layout.
	 *
	 * We honor both the explicit `config.integration` override and injected
	 * `config.__eco.integration` metadata because pages can arrive here through
	 * authored config as well as build-time component metadata.
	 */
	private getComponentIntegration(component?: { config?: EcoComponentConfig } | null): string | undefined {
		return component?.config?.integration ?? component?.config?.__eco?.integration;
	}

	/**
	 * Returns whether a component should stay inside the React render lane.
	 *
	 * Components without explicit integration metadata are treated as React-owned
	 * here because this renderer only receives them after the route pipeline has
	 * already selected the React integration.
	 */
	private isReactManagedComponent(component?: { config?: EcoComponentConfig } | null): boolean {
		const integration = this.getComponentIntegration(component);
		return integration === undefined || integration === this.name;
	}

	private getComponentRequires(component?: (EcoComponent & RequiresAwareComponent) | null) {
		return component?.requires;
	}

	private getRouterDocumentAttributes(): Record<string, string> | undefined {
		if (!this.routerAdapter) {
			return undefined;
		}

		return {
			[ECO_DOCUMENT_OWNER_ATTRIBUTE]: 'react-router',
		};
	}

	/**
	 * Commits a framework-agnostic component to React semantics.
	 *
	 * This is one of the two real cast boundaries in this file. Core keeps
	 * `EcoComponent` broad so integrations can share the same public surface; once
	 * the React renderer is executing, `createElement()` needs a concrete React
	 * component signature.
	 */
	private asReactComponent<P extends SerializableProps>(component: unknown): ReactRenderableComponent<P> {
		return component as ReactRenderableComponent<P>;
	}

	/**
	 * Commits a mixed-shell component to the string-returning contract required by
	 * non-React layouts and HTML templates.
	 *
	 * This is the second real cast boundary: once we decide a shell is not managed
	 * by React, we call it directly and require serialized HTML back.
	 */
	private asNonReactShellComponent<P extends SerializableProps>(
		component: unknown,
	): (props: P) => EcoPagesElement | Promise<EcoPagesElement> {
		return component as (props: P) => EcoPagesElement | Promise<EcoPagesElement>;
	}

	protected resolveReactRuntimeModules(): ReactRuntimeModules {
		const appPackageJsonPath = path.resolve(this.appConfig.rootDir || process.cwd(), 'package.json');

		try {
			const requireFromApp = createRequire(appPackageJsonPath);

			return {
				react: requireFromApp('react') as ReactRuntimeModules['react'],
				reactDomServer: requireFromApp('react-dom/server') as ReactRuntimeModules['reactDomServer'],
			};
		} catch {
			const requireFromIntegration = createRequire(import.meta.url);

			return {
				react: requireFromIntegration('react') as ReactRuntimeModules['react'],
				reactDomServer: requireFromIntegration('react-dom/server') as ReactRuntimeModules['reactDomServer'],
			};
		}
	}

	private getReactRuntimeModules(): ReactRuntimeModules {
		this.reactRuntimeModules ??= this.resolveReactRuntimeModules();
		return this.reactRuntimeModules;
	}

	/**
	 * Appends route hydration assets for a concrete page/view file to the current
	 * HTML transformer state.
	 */
	private async appendHydrationAssetsForFile(filePath?: string): Promise<void> {
		if (!filePath) {
			return;
		}

		const hydrationAssets = await this.buildRouteRenderAssets(filePath);
		this.appendProcessedDependencies(hydrationAssets);
	}

	/**
	 * Renders a non-React layout or HTML template and enforces that mixed shells
	 * return serialized HTML.
	 *
	 * The React renderer can compose through another integration's shell, but only
	 * if that shell yields a string that can be inserted into the final document.
	 */
	private async renderNonReactShellComponent<P extends SerializableProps>(
		Component: (props: P) => EcoPagesElement | Promise<EcoPagesElement>,
		props: P,
		label: 'Layout' | 'HtmlTemplate' | 'Component',
	): Promise<string> {
		const output = await Component(props);
		if (typeof output === 'string') {
			return output;
		}

		throw new ReactRenderError(`${label} must return a string when used as a mixed shell for React pages.`);
	}

	/**
	 * Renders one React component boundary while preserving already-resolved child HTML.
	 *
	 * When nested boundary resolution has already produced child HTML for this
	 * boundary, the child payload must remain raw SSR output rather than a React
	 * string child, otherwise React would escape it. This helper renders a unique
	 * token through React and swaps that token back to the resolved HTML
	 * afterward.
	 *
	 * @param input Component render input for the current boundary.
	 * @param context React-specific render context for stable token generation.
	 * @returns Serialized component HTML with resolved child markup preserved.
	 */
	private renderComponentHtml(
		input: ComponentRenderInput,
		context: ReactComponentRenderContext,
		runtimeContext?: ReactBoundaryRuntimeContext,
	): string {
		const { react, reactDomServer } = this.getReactRuntimeModules();

		if (input.children === undefined) {
			return this.normalizeBoundaryArtifactHtml(
				reactDomServer.renderToString(react.createElement(this.asReactComponent(input.component), input.props)),
			);
		}

		const resolvedChildHtml = typeof input.children === 'string' ? input.children : String(input.children ?? '');
		const rawChildrenToken = `__ECO_RAW_HTML_CHILD_${context.componentInstanceId ?? 'component'}__`;
		if (runtimeContext) {
			runtimeContext.rawChildrenToken = rawChildrenToken;
			runtimeContext.rawChildrenHtml = resolvedChildHtml;
		}
		const html = reactDomServer.renderToString(
			react.createElement(this.asReactComponent(input.component), input.props, rawChildrenToken),
		);
		return this.normalizeBoundaryArtifactHtml(html.split(rawChildrenToken).join(resolvedChildHtml));
	}

	/**
	 * Restores raw child HTML that was temporarily replaced by a token during React SSR.
	 *
	 * Queued boundary resolution may render children through a fragment path before all
	 * nested integration tokens are resolved. When that happens, React must never see
	 * the resolved child HTML as a normal string child or it would escape it. The
	 * runtime context stores the placeholder token and the raw child HTML so the
	 * fragment render path can reinsert it before foreign boundary tokens are handled.
	 */
	private restoreRuntimeChildHtml(html: string, runtimeContext: ReactBoundaryRuntimeContext | undefined): string {
		if (!runtimeContext?.rawChildrenToken || runtimeContext.rawChildrenHtml === undefined) {
			return html;
		}

		return html.split(runtimeContext.rawChildrenToken).join(runtimeContext.rawChildrenHtml);
	}

	/**
	 * Renders queued child content through React and then resolves nested boundary tokens.
	 *
	 * This path is only used for children that were deferred while React rendered the
	 * parent boundary. It first restores any raw child HTML placeholders owned by the
	 * current runtime context, then asks the shared queued-boundary resolver to swap
	 * foreign integration tokens with their resolved HTML.
	 */
	private async renderQueuedChildrenToHtml(
		children: unknown,
		runtimeContext: ReactBoundaryRuntimeContext,
		queuedResolutionsByToken: Map<string, ReactBoundaryRuntimeContext['queuedResolutions'][number]>,
		resolveToken: (token: string) => Promise<string>,
	): Promise<string | undefined> {
		if (children === undefined) {
			return undefined;
		}

		const { react, reactDomServer } = this.getReactRuntimeModules();

		let html = this.normalizeBoundaryArtifactHtml(
			reactDomServer.renderToString(react.createElement(react.Fragment, null, children as ReactNode)),
		);
		html = this.restoreRuntimeChildHtml(html, runtimeContext);

		html = await this.resolveQueuedBoundaryTokens(html, queuedResolutionsByToken, resolveToken);

		return html;
	}

	/**
	 * Resolves queued renderer-owned boundary tokens produced during React component rendering.
	 *
	 * React components can enqueue nested boundaries while the parent HTML is being
	 * rendered. This delegates to the shared renderer-owned queue resolver but keeps
	 * the React-specific child rendering behavior local so raw child HTML and React's
	 * fragment rendering semantics stay coordinated.
	 */
	private async resolveQueuedBoundaryHtml(
		html: string,
		runtimeContext: ReactBoundaryRuntimeContext | undefined,
	): Promise<{ assets: NonNullable<ComponentRenderResult['assets']>; html: string }> {
		return this.resolveRendererOwnedQueuedBoundaryHtml({
			html,
			runtimeContext,
			queueLabel: 'React',
			renderQueuedChildren: async (children, currentRuntimeContext, queuedResolutionsByToken, resolveToken) => {
				const renderedHtml = await this.renderQueuedChildrenToHtml(
					children,
					currentRuntimeContext,
					queuedResolutionsByToken,
					resolveToken,
				);

				return {
					assets: [],
					html: renderedHtml,
				};
			},
		});
	}

	private buildHydrationProps(props: SerializableProps | undefined): SerializableProps {
		if (!props || !Object.prototype.hasOwnProperty.call(props, 'locals')) {
			return props ?? {};
		}

		const { locals: _locals, ...hydrationProps } = props;
		return hydrationProps;
	}

	/**
	 * Builds the extra document props needed when React renders through a non-React HTML shell.
	 *
	 * Router-backed React pages still need to publish the canonical page-data script
	 * even when the outer document shell belongs to another integration.
	 */
	private buildNonReactDocumentProps(
		htmlTemplate: { config?: EcoComponentConfig } | null | undefined,
		pageProps: SerializableProps,
	): { headContent: string } | undefined {
		if (this.isReactManagedComponent(htmlTemplate) || !this.routerAdapter) {
			return undefined;
		}

		return {
			headContent: this.pagePayloadService.buildRouterPageDataScript(pageProps),
		};
	}

	/**
	 * Renders a foreign integration component boundary that participates in React composition.
	 *
	 * Non-React components must resolve to serialized HTML so React can embed them as
	 * mixed-shell boundaries. Any component-owned dependencies still need to flow
	 * through the shared dependency resolver before queued boundary tokens are finalized.
	 */
	private async renderForeignComponentBoundary(
		input: ComponentRenderInput,
		runtimeContext: ReactBoundaryRuntimeContext | undefined,
	): Promise<ComponentRenderResult> {
		let props = input.props;
		if (input.children !== undefined) {
			props = {
				...input.props,
				children: typeof input.children === 'string' ? input.children : String(input.children ?? ''),
			};
		}

		const html = await this.renderNonReactShellComponent(
			this.asNonReactShellComponent<Record<string, unknown>>(input.component),
			props,
			'Component',
		);
		const hasDependencies = Boolean(input.component.config?.dependencies);
		const canResolveAssets = typeof this.assetProcessingService?.processDependencies === 'function';
		const assets =
			hasDependencies && canResolveAssets
				? await this.processComponentDependencies([input.component])
				: undefined;
		const queuedBoundaryResolution = await this.resolveQueuedBoundaryHtml(html, runtimeContext);
		const mergedAssets = this.htmlTransformer.dedupeProcessedAssets([
			...(assets ?? []),
			...queuedBoundaryResolution.assets,
		]);

		return {
			html: queuedBoundaryResolution.html,
			canAttachAttributes: true,
			rootTag: this.getRootTagName(queuedBoundaryResolution.html),
			integrationName: this.name,
			assets: mergedAssets.length > 0 ? mergedAssets : undefined,
		};
	}

	/**
	 * Renders a React-owned component boundary and attaches island hydration metadata when possible.
	 *
	 * This path keeps React-owned SSR, queued boundary resolution, and optional
	 * island hydration wiring together so the public `renderComponent()` method can
	 * read as orchestration rather than implementation detail.
	 */
	private async renderReactComponentBoundary(
		input: ComponentRenderInput,
		runtimeContext: ReactBoundaryRuntimeContext | undefined,
	): Promise<ComponentRenderResult> {
		const componentConfig = input.component.config;
		const context: ReactComponentRenderContext = {
			componentInstanceId: input.integrationContext?.componentInstanceId,
		};
		const hasResolvedChildHtml = input.children !== undefined;
		let html = this.renderComponentHtml(input, context, runtimeContext);
		const queuedBoundaryResolution = await this.resolveQueuedBoundaryHtml(html, runtimeContext);
		html = queuedBoundaryResolution.html;
		const canAttachAttributes = hasSingleRootElement(html);
		const rootTag = this.getRootTagName(html);
		const componentFile = componentConfig?.__eco?.file;

		let rootAttributes: Record<string, string> | undefined;
		let assets: ProcessedAsset[] | undefined;

		if (
			canAttachAttributes &&
			componentFile &&
			context.componentInstanceId &&
			this.assetProcessingService &&
			!hasResolvedChildHtml
		) {
			const componentInstanceId = context.componentInstanceId;
			assets = await this.hydrationAssetService.buildComponentRenderAssets(componentFile, componentConfig);
			rootAttributes = {
				'data-eco-component-id': componentInstanceId,
				'data-eco-component-key': getReactIslandComponentKey(componentFile, componentConfig),
				'data-eco-props': btoa(JSON.stringify(this.buildHydrationProps(input.props))),
			};
		}

		const mergedAssets = this.htmlTransformer.dedupeProcessedAssets([
			...(assets ?? []),
			...queuedBoundaryResolution.assets,
		]);

		return {
			html,
			canAttachAttributes,
			rootTag,
			integrationName: this.name,
			rootAttributes,
			assets: mergedAssets.length > 0 ? mergedAssets : undefined,
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
	 * - When resolved child HTML is provided, that boundary is treated as a pure SSR
	 *   composition step and does not emit hydration assets for the parent wrapper.
	 *
	 * This preserves DOM shape for global CSS/layout selectors while keeping a
	 * deterministic mount target per component instance.
	 */
	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		const runtimeContext = this.getQueuedBoundaryRuntime<ReactBoundaryRuntimeContext>(input);

		if (!this.isReactManagedComponent(input.component)) {
			return this.renderForeignComponentBoundary(input, runtimeContext);
		}

		return this.renderReactComponentBoundary(input, runtimeContext);
	}

	protected override createComponentBoundaryRuntime(options: {
		boundaryInput: ComponentRenderInput;
		rendererCache: Map<string, IntegrationRenderer<any>>;
	}) {
		return this.createQueuedBoundaryRuntime<ReactBoundaryRuntimeContext>({
			boundaryInput: options.boundaryInput,
			rendererCache: options.rendererCache,
			createRuntimeContext: (integrationContext, rendererCache) => ({
				rendererCache: rendererCache as Map<string, IntegrationRenderer<any>>,
				componentInstanceScope: integrationContext.componentInstanceId,
				nextBoundaryId: 0,
				queuedResolutions: [],
				rawChildrenToken: undefined,
				rawChildrenHtml: undefined,
			}),
		});
	}

	/**
	 * Checks if the given file path corresponds to an MDX file based on configured extensions.
	 * @param filePath - The file path to check
	 * @returns True if the file is an MDX file
	 */
	public isMdxFile(filePath: string): boolean {
		return this.pageModuleService.isMdxFile(filePath);
	}

	protected override usesIntegrationPageImporter(file: string): boolean {
		return this.pageModuleService.isMdxFile(file);
	}

	protected override async importIntegrationPageFile(
		file: string,
		options?: RouteModuleLoadOptions,
	): Promise<EcoPageFile> {
		return await this.pageModuleService.importMdxPageFile(file, options);
	}

	protected override normalizeImportedPageFile<TPageModule extends EcoPageFile>(
		file: string,
		pageModule: TPageModule,
	): TPageModule {
		const reactModule = pageModule as TPageModule & { config?: EcoComponentConfig };
		const { default: Page, getMetadata, config } = reactModule;

		if (this.pageModuleService.isMdxFile(file) && config) {
			Page.config = config;
		}

		return {
			...pageModule,
			default: Page,
			getMetadata,
			config,
		} as TPageModule;
	}

	override async buildRouteRenderAssets(pagePath: string): Promise<ProcessedAsset[]> {
		try {
			const pageModule = await this.importPageFile(pagePath);
			const shouldHydrate = this.explicitGraphEnabled
				? true
				: this.pageModuleService.shouldHydratePage(pageModule);
			if (!shouldHydrate) {
				return [];
			}

			const isMdx = this.pageModuleService.isMdxFile(pagePath);
			const declaredModules = this.pageModuleService.collectPageDeclaredModules(pageModule);
			const processedAssets = await this.hydrationAssetService.buildRouteRenderAssets(
				pagePath,
				isMdx,
				declaredModules,
			);

			if (isMdx) {
				const mdxConfigAssets = await this.mdxConfigDependencyService.processMdxConfigDependencies({
					pagePath,
					config: (pageModule as EcoPageFile & { config?: EcoComponentConfig }).config,
					processComponentDependencies: async (components) =>
						await this.processComponentDependencies(components),
				});
				return [...processedAssets, ...mdxConfigAssets];
			}

			return processedAssets;
		} catch (error) {
			if (error instanceof BundleError) {
				console.error('[ecopages] Bundle errors:', error.logs);
			}

			throw new ReactRenderError(
				`Failed to generate hydration script: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Renders a full route response for the filesystem page pipeline.
	 *
	 * This path receives already-resolved route metadata, layout, locals, and HTML
	 * template instances from the shared renderer orchestration. Its main job is to
	 * serialize only the browser-safe page payload, compose the mixed React/non-
	 * React shell tree, and hand the result back as a document body.
	 */
	async render({
		params,
		query,
		props,
		locals,
		pageLocals,
		metadata,
		Page,
		Layout,
		HtmlTemplate,
		pageProps,
	}: IntegrationRendererRenderOptions<ReactNode>): Promise<RouteRendererBody> {
		try {
			const safeLocals = this.pagePayloadService.getSerializableLocals(locals, this.getComponentRequires(Page));
			const allPageProps = this.pagePayloadService.buildSerializedPageProps({
				pageProps,
				params,
				query,
				safeLocals,
			});

			return await this.renderPageWithDocumentShell({
				page: {
					component: Page,
					props: { params, query, ...props, locals: pageLocals },
				},
				layout: Layout
					? {
							component: Layout,
							props: locals ? { locals } : {},
						}
					: undefined,
				htmlTemplate: HtmlTemplate,
				metadata,
				pageProps: allPageProps,
				documentProps: this.buildNonReactDocumentProps(HtmlTemplate, allPageProps),
			});
		} catch (error) {
			throw this.createRenderError('Failed to render component', error);
		}
	}

	protected override getDocumentAttributes(): Record<string, string> | undefined {
		return this.getRouterDocumentAttributes();
	}

	/**
	 * Renders an arbitrary React view through the application's HTML shell.
	 *
	 * Unlike route rendering, this path starts from a single component rather than a
	 * page module discovered by the router. It still needs to resolve metadata,
	 * layout dependencies, and hydration assets so direct `ctx.render()` calls match
	 * normal page responses.
	 */
	async renderToResponse<P = Record<string, unknown>>(
		view: EcoComponent<P>,
		props: P,
		ctx: RenderToResponseContext,
	): Promise<Response> {
		try {
			const { react, reactDomServer } = this.getReactRuntimeModules();
			const viewConfig = view.config;
			const Layout = viewConfig?.layout;
			const ViewComponent = this.asReactComponent(view);
			const normalizedProps = (props ?? {}) as SerializableProps;

			if (ctx.partial) {
				return this.renderPartialViewResponse({
					view,
					props,
					ctx,
					renderInline: async () =>
						await reactDomServer.renderToReadableStream(
							react.createElement(ViewComponent, normalizedProps),
						),
				});
			}

			const HtmlTemplate = await this.getHtmlTemplate();
			const metadata = await this.resolveViewMetadata(view, props);

			await this.prepareViewDependencies(view, Layout);
			await this.appendHydrationAssetsForFile(viewConfig?.__eco?.file);

			const viewRender = await this.renderComponentBoundary({
				component: view,
				props: normalizedProps,
			});
			const layoutRender = Layout
				? await this.renderComponentBoundary({
						component: Layout,
						props: {},
						children: viewRender.html,
					})
				: undefined;
			const documentRender = await this.renderComponentBoundary({
				component: HtmlTemplate,
				props: {
					metadata,
					pageProps: normalizedProps,
					...(this.buildNonReactDocumentProps(HtmlTemplate, normalizedProps) ?? {}),
				},
				children: layoutRender?.html ?? viewRender.html,
			});

			this.appendProcessedDependencies(viewRender.assets, layoutRender?.assets, documentRender.assets);

			const transformedHtml = await this.finalizeResolvedHtml({
				html: `${this.DOC_TYPE}${documentRender.html}`,
				partial: false,
				documentAttributes: this.getRouterDocumentAttributes(),
			});

			return this.createHtmlResponse(transformedHtml, ctx);
		} catch (error) {
			throw this.createRenderError('Failed to render view', error);
		}
	}
}
