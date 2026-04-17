/**
 * This module contains the React renderer
 * @module
 */

import type {
	DependencyAttributes,
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoComponentConfig,
	EcoHtmlComponent,
	EcoPageFile,
	EcoPageLayoutComponent,
	EcoPagesElement,
	HtmlTemplateProps,
	IntegrationRendererRenderOptions,
	PageMetadataProps,
	RequestLocals,
	RouteRendererBody,
} from '@ecopages/core';
import {
	IntegrationRenderer,
	type RenderToResponseContext,
	type RouteModuleLoadOptions,
} from '@ecopages/core/route-renderer/integration-renderer';
import { LocalsAccessError } from '@ecopages/core/errors/locals-access-error';
import { RESOLVED_ASSETS_DIR } from '@ecopages/core/constants';
import { getAppBuildExecutor } from '@ecopages/core/build/build-adapter';
import { rapidhash } from '@ecopages/core/hash';
import type { ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import { AssetFactory, type AssetDefinition } from '@ecopages/core/services/asset-processing-service';
import { ECO_DOCUMENT_OWNER_ATTRIBUTE } from '@ecopages/core/router/navigation-coordinator';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { FunctionComponent, ReactNode } from 'react';
import type { CompileOptions } from '@mdx-js/mdx';
import { PLUGIN_NAME } from './react.plugin.ts';
import type { ReactRouterAdapter } from './router-adapter.ts';
import { hasSingleRootElement } from './utils/html-boundary.ts';
import { ReactBundleService } from './services/react-bundle.service.ts';
import { ReactHmrPageMetadataCache } from './services/react-hmr-page-metadata-cache.ts';
import { ReactPageModuleService } from './services/react-page-module.service.ts';
import { getReactIslandComponentKey, ReactHydrationAssetService } from './services/react-hydration-asset.service.ts';

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

type NonReactLayoutProps = {
	children: string;
	locals?: RequestLocals;
};

type NonReactHtmlTemplateProps = {
	metadata: PageMetadataProps;
	pageProps: HtmlTemplateProps['pageProps'];
	children: string;
	headContent?: string;
};

type ReactPageModule = EcoPageFile<{ config?: EcoComponentConfig }> & {
	config?: EcoComponentConfig;
};

type RequiresAwareComponent = {
	requires?: string | readonly string[];
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
	name = PLUGIN_NAME;
	componentDirectory = RESOLVED_ASSETS_DIR;
	static routerAdapter: ReactRouterAdapter | undefined;
	static mdxCompilerOptions: CompileOptions | undefined;
	static mdxExtensions: string[] = ['.mdx'];
	static hmrPageMetadataCache: ReactHmrPageMetadataCache | undefined;
	private reactRuntimeModules?: ReactRuntimeModules;
	/**
	 * Enables explicit graph behavior for React page-entry bundling.
	 *
	 * When true, page-entry bundles disable AST server-only stripping and rely
	 * on explicit dependency declarations for browser graph composition.
	 */
	static explicitGraphEnabled = false;

	/** @internal */
	readonly bundleService: ReactBundleService;
	/** @internal */
	readonly pageModuleService: ReactPageModuleService;
	/** @internal */
	readonly hydrationAssetService: ReactHydrationAssetService;

	constructor(options: {
		appConfig: ConstructorParameters<typeof IntegrationRenderer>[0]['appConfig'];
		assetProcessingService: ConstructorParameters<typeof IntegrationRenderer>[0]['assetProcessingService'];
		resolvedIntegrationDependencies?: ProcessedAsset[];
		runtimeOrigin: string;
	}) {
		super(options);

		this.bundleService = new ReactBundleService({
			rootDir: this.appConfig.rootDir,
			routerAdapter: ReactRenderer.routerAdapter,
			mdxCompilerOptions: ReactRenderer.mdxCompilerOptions,
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
			mdxCompilerOptions: ReactRenderer.mdxCompilerOptions,
			mdxExtensions: ReactRenderer.mdxExtensions,
			integrationName: this.name,
			hasRouterAdapter: Boolean(ReactRenderer.routerAdapter),
		});

		this.hydrationAssetService = new ReactHydrationAssetService({
			srcDir: this.appConfig.srcDir,
			routerAdapter: ReactRenderer.routerAdapter,
			assetProcessingService: this.assetProcessingService,
			bundleService: this.bundleService,
			hmrPageMetadataCache: ReactRenderer.hmrPageMetadataCache,
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

	/**
	 * Creates the canonical page-props payload used by router hydration.
	 *
	 * React pages embedded in a non-React HTML shell still need to expose the same
	 * page-data contract as fully React-owned documents so navigation and hydration
	 * can read one shared document payload consistently.
	 */
	private buildRouterPageDataScript(pageProps: HtmlTemplateProps['pageProps'] | undefined): string {
		const safeJson = JSON.stringify(pageProps || {}).replace(/</g, '\\u003c');
		return `<script id="__ECO_PAGE_DATA__" type="application/json">${safeJson}</script>`;
	}

	private getRouterDocumentAttributes(): Record<string, string> | undefined {
		if (!ReactRenderer.routerAdapter) {
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
	 * Builds the serialized page-props payload embedded into the final HTML.
	 *
	 * The document payload is intentionally narrower than the full server render
	 * input: only routing data, public page props, and explicitly allowed locals are
	 * exposed to the browser.
	 */
	private buildSerializedPageProps(options: {
		pageProps?: HtmlTemplateProps['pageProps'];
		params: IntegrationRendererRenderOptions<ReactNode>['params'];
		query: IntegrationRendererRenderOptions<ReactNode>['query'];
		safeLocals?: RequestLocals;
	}): HtmlTemplateProps['pageProps'] {
		return {
			...options.pageProps,
			params: options.params,
			query: options.query,
			...(options.safeLocals && { locals: options.safeLocals }),
		};
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

	private restoreRuntimeChildHtml(html: string, runtimeContext: ReactBoundaryRuntimeContext | undefined): string {
		if (!runtimeContext?.rawChildrenToken || runtimeContext.rawChildrenHtml === undefined) {
			return html;
		}

		return html.split(runtimeContext.rawChildrenToken).join(runtimeContext.rawChildrenHtml);
	}

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

		const { locals: _locals, ...hydrationProps } = props as SerializableProps & { locals?: unknown };
		return hydrationProps;
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

		const componentConfig = input.component.config;
		const context = (input.integrationContext as ReactComponentRenderContext | undefined) ?? {};
		const hasResolvedChildHtml = input.children !== undefined;
		let html = this.renderComponentHtml(input, context, runtimeContext);
		const queuedBoundaryResolution = await this.resolveQueuedBoundaryHtml(html, runtimeContext);
		html = queuedBoundaryResolution.html;
		let canAttachAttributes = hasSingleRootElement(html);
		let rootTag = this.getRootTagName(html);
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
		return (await this.pageModuleService.importMdxPageFile(file, options)) as EcoPageFile;
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

	/**
	 * Processes MDX-specific configuration dependencies including layout dependencies.
	 * @param pagePath - Absolute path to the MDX page file
	 * @returns Processed assets for MDX configuration dependencies
	 */
	private async processMdxConfigDependencies(pagePath: string): Promise<ProcessedAsset[]> {
		const pageModule = await this.importPageFile(pagePath);
		const config = (pageModule as EcoPageFile & { config?: EcoComponentConfig }).config;
		const resolvedLayout = config?.layout;
		const components: Partial<EcoComponent>[] = [];

		if (resolvedLayout?.config?.dependencies) {
			const layoutConfig = this.pageModuleService.ensureConfigFileMetadata(resolvedLayout.config, pagePath);
			components.push({ config: layoutConfig });
		}

		if (config?.dependencies) {
			const configWithMeta = {
				...config,
				__eco: { id: rapidhash(pagePath).toString(36), file: pagePath, integration: 'react' },
			};
			components.push({ config: configWithMeta });
		}

		const processedDependencies = await this.processComponentDependencies(components);
		const eagerSsrLazyDependencies = await this.processDeclaredMdxSsrLazyDependencies(components, pagePath);

		return [...processedDependencies, ...eagerSsrLazyDependencies];
	}

	private async processDeclaredMdxSsrLazyDependencies(
		components: Partial<EcoComponent>[],
		pagePath: string,
	): Promise<ProcessedAsset[]> {
		if (!this.assetProcessingService?.processDependencies) {
			return [];
		}

		const dependencies = this.collectDeclaredMdxSsrLazyDependencies(components);
		if (dependencies.length === 0) {
			return [];
		}

		return this.assetProcessingService.processDependencies(dependencies, `react-mdx-ssr-lazy:${pagePath}`);
	}

	private collectDeclaredMdxSsrLazyDependencies(components: Partial<EcoComponent>[]): AssetDefinition[] {
		const dependencies: AssetDefinition[] = [];
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

	override async buildRouteRenderAssets(pagePath: string): Promise<ProcessedAsset[]> {
		try {
			const pageModule = await this.importPageFile(pagePath);
			const shouldHydrate = ReactRenderer.explicitGraphEnabled
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
				const mdxConfigAssets = await this.processMdxConfigDependencies(pagePath);
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
			const safeLocals = this.getSerializableLocals(locals, (Page as RequiresAwareComponent).requires);
			const allPageProps = this.buildSerializedPageProps({
				pageProps,
				params,
				query,
				safeLocals,
			});

			return await this.renderPageWithDocumentShell({
				page: {
					component: Page as EcoComponent,
					props: { params, query, ...props, locals: pageLocals },
				},
				layout: Layout
					? {
							component: Layout as EcoComponent,
							props: locals ? { locals } : {},
						}
					: undefined,
				htmlTemplate: HtmlTemplate as EcoComponent,
				metadata,
				pageProps: allPageProps,
				documentProps:
					!this.isReactManagedComponent(HtmlTemplate) && ReactRenderer.routerAdapter
						? { headContent: this.buildRouterPageDataScript(allPageProps) }
						: undefined,
			});
		} catch (error) {
			throw this.createRenderError('Failed to render component', error);
		}
	}

	protected override getDocumentAttributes(): Record<string, string> | undefined {
		return this.getRouterDocumentAttributes();
	}

	/**
	 * Safely extracts the declared subset of locals for client-side hydration.
	 *
	 * On dynamic pages with `cache: 'dynamic'`, middleware populates `locals` with
	 * request-scoped data (e.g., session). Only keys explicitly declared via
	 * `Page.requires` are serialized to the client so sensitive request-only data
	 * is not leaked into hydration payloads by default.
	 *
	 * On static pages, `locals` is a Proxy that throws `LocalsAccessError` on access
	 * to prevent accidental use. This method safely detects that case and returns
	 * `undefined` instead of throwing.
	 *
	 * @param locals - The locals object from the render context
	 * @param requiredLocals - Keys explicitly requested for client hydration
	 * @returns The filtered locals object if serializable, undefined otherwise
	 */
	private getSerializableLocals(
		locals: RequestLocals | undefined,
		requiredLocals?: string | readonly string[],
	): RequestLocals | undefined {
		try {
			if (!locals) {
				return undefined;
			}

			const requiredKeys = requiredLocals
				? Array.isArray(requiredLocals)
					? requiredLocals
					: [requiredLocals]
				: [];

			if (requiredKeys.length === 0) {
				return undefined;
			}

			const serializedLocals = Object.fromEntries(
				requiredKeys
					.filter((key) => Object.prototype.hasOwnProperty.call(locals, key))
					.map((key) => [key, locals[key as keyof RequestLocals]]),
			) as RequestLocals;

			if (Object.keys(serializedLocals).length > 0) {
				return serializedLocals;
			}
			return undefined;
		} catch (e) {
			if (e instanceof LocalsAccessError) {
				return undefined;
			}
			throw e;
		}
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
						await reactDomServer.renderToReadableStream(react.createElement(ViewComponent, normalizedProps)),
				});
			}

			const HtmlTemplate = await this.getHtmlTemplate();
			const metadata = await this.resolveViewMetadata(view, props);

			await this.prepareViewDependencies(view, Layout);
			await this.appendHydrationAssetsForFile(viewConfig?.__eco?.file);

			const viewRender = await this.renderComponentBoundary({
				component: view as EcoComponent,
				props: normalizedProps,
			});
			const layoutRender = Layout
				? await this.renderComponentBoundary({
						component: Layout as EcoComponent,
						props: {},
						children: viewRender.html,
					})
				: undefined;
			const documentRender = await this.renderComponentBoundary({
				component: HtmlTemplate as EcoComponent,
				props: {
					metadata,
					pageProps: normalizedProps,
					...(!this.isReactManagedComponent(HtmlTemplate) && ReactRenderer.routerAdapter
						? { headContent: this.buildRouterPageDataScript(normalizedProps) }
						: {}),
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
