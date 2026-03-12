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
	HtmlTemplateProps,
	IntegrationRendererRenderOptions,
	PageMetadataProps,
	RequestLocals,
	RouteRendererBody,
} from '@ecopages/core';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import { LocalsAccessError } from '@ecopages/core/errors/locals-access-error';
import { RESOLVED_ASSETS_DIR } from '@ecopages/core/constants';
import { rapidhash } from '@ecopages/core/hash';
import type { ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import { createElement, type ReactNode } from 'react';
import { renderToReadableStream, renderToString } from 'react-dom/server';
import type { CompileOptions } from '@mdx-js/mdx';
import { PLUGIN_NAME } from './react.plugin.ts';
import type { ReactRouterAdapter } from './router-adapter.ts';
import { hasSingleRootElement } from './utils/html-boundary.ts';
import { ReactBundleService } from './services/react-bundle.service.ts';
import { ReactHmrPageMetadataCache } from './services/react-hmr-page-metadata-cache.ts';
import { ReactPageModuleService } from './services/react-page-module.service.ts';
import { ReactHydrationAssetService } from './services/react-hydration-asset.service.ts';

type ReactComponentRenderContext = {
	componentInstanceId?: string;
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
	constructor(
		message: string,
		public readonly logs: string[],
	) {
		super(message);
		this.name = 'BundleError';
	}
}

/**
 * Renderer for React components.
 * @extends IntegrationRenderer
 */
export class ReactRenderer extends IntegrationRenderer<ReactNode> {
	name = PLUGIN_NAME;
	componentDirectory = RESOLVED_ASSETS_DIR;
	private componentRenderSequence = 0;
	static routerAdapter: ReactRouterAdapter | undefined;
	static mdxCompilerOptions: CompileOptions | undefined;
	static mdxExtensions: string[] = ['.mdx'];
	static hmrPageMetadataCache: ReactHmrPageMetadataCache | undefined;
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
		});

		this.pageModuleService = new ReactPageModuleService({
			rootDir: this.appConfig.rootDir,
			distDir: this.appConfig.absolutePaths.distDir,
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
	 * Renders a React component for component-level orchestration.
	 *
	 * Behavior:
	 * - SSR always returns the component's own root HTML (no synthetic wrapper).
	 * - For single-root output, a stable `data-eco-component-id` attribute is attached
	 *   to the root element so the client island runtime can target it directly.
	 * - Island client scripts are emitted through `assets` and mounted independently.
	 *
	 * This preserves DOM shape for global CSS/layout selectors while keeping a
	 * deterministic mount target per component instance.
	 */
	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		const Component = input.component as unknown as React.FunctionComponent;
		const componentConfig = input.component.config;
		const element =
			input.children === undefined
				? createElement(Component, input.props)
				: createElement(Component, input.props, input.children);
		let html = renderToString(element);
		let canAttachAttributes = hasSingleRootElement(html);
		let rootTag = this.getRootTagName(html);
		const componentFile = componentConfig?.__eco?.file;
		const context = (input.integrationContext as ReactComponentRenderContext | undefined) ?? {};

		let rootAttributes: Record<string, string> | undefined;
		let assets: ProcessedAsset[] | undefined;

		if (canAttachAttributes && componentFile && this.assetProcessingService) {
			const componentInstanceId =
				context.componentInstanceId ??
				`eco-component-${rapidhash(componentFile)}-${++this.componentRenderSequence}`;
			assets = await this.hydrationAssetService.buildComponentRenderAssets(
				componentFile,
				componentInstanceId,
				input.props,
				componentConfig,
			);
			rootAttributes = { 'data-eco-component-id': componentInstanceId };
		}

		return {
			html,
			canAttachAttributes,
			rootTag,
			integrationName: this.name,
			rootAttributes,
			assets,
		};
	}

	/**
	 * Checks if the given file path corresponds to an MDX file based on configured extensions.
	 * @param filePath - The file path to check
	 * @returns True if the file is an MDX file
	 */
	public isMdxFile(filePath: string): boolean {
		return this.pageModuleService.isMdxFile(filePath);
	}

	/**
	 * Processes MDX-specific configuration dependencies including layout dependencies.
	 * @param pagePath - Absolute path to the MDX page file
	 * @returns Processed assets for MDX configuration dependencies
	 */
	private async processMdxConfigDependencies(pagePath: string): Promise<ProcessedAsset[]> {
		const { config } = await this.importPageFile(pagePath);
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

		return this.processComponentDependencies(components);
	}

	override async buildRouteRenderAssets(pagePath: string): Promise<ProcessedAsset[]> {
		try {
			const pageModule = (await this.importPageFile(pagePath)) as EcoPageFile<{ config?: EcoComponentConfig }> & {
				config?: EcoComponentConfig;
			};
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

	protected override async importPageFile(file: string): Promise<EcoPageFile<{ config?: EcoComponentConfig }>> {
		const module = (
			this.pageModuleService.isMdxFile(file)
				? await this.pageModuleService.importMdxPageFile(file)
				: await super.importPageFile(file)
		) as EcoPageFile<{ config?: EcoComponentConfig }> & {
			config?: EcoComponentConfig;
		};
		const { default: Page, getMetadata, config } = module;

		if (this.pageModuleService.isMdxFile(file) && config) {
			Page.config = config;
		}

		return {
			default: Page,
			getMetadata,
			config,
		};
	}

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
			const pageElement = createElement(Page, { params, query, ...props, locals: pageLocals });
			const contentElement = Layout
				? createElement(Layout as React.FunctionComponent, { locals } as object, pageElement)
				: pageElement;

			const safeLocals = this.getSerializableLocals(
				locals as RequestLocals,
				(Page as typeof Page & { requires?: string | readonly string[] }).requires,
			);
			const allPageProps: HtmlTemplateProps['pageProps'] = {
				...pageProps,
				params,
				query,
				...(safeLocals && { locals: safeLocals }),
			};

			return await renderToReadableStream(
				createElement(
					HtmlTemplate,
					{
						metadata,
						pageProps: allPageProps,
					} as HtmlTemplateProps,
					contentElement,
				),
			);
		} catch (error) {
			throw this.createRenderError('Failed to render component', error);
		}
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
		locals: RequestLocals,
		requiredLocals?: string | readonly string[],
	): RequestLocals | undefined {
		try {
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

	async renderToResponse<P = Record<string, unknown>>(
		view: EcoComponent<P>,
		props: P,
		ctx: RenderToResponseContext,
	): Promise<Response> {
		try {
			const viewConfig = view.config;
			const Layout = viewConfig?.layout as React.FunctionComponent | undefined;

			const ViewComponent = view as unknown as React.FunctionComponent;
			const pageElement = createElement(ViewComponent, props || {});

			if (ctx.partial) {
				const stream = await renderToReadableStream(pageElement);
				return this.createHtmlResponse(stream, ctx);
			}

			const contentElement = Layout
				? createElement(Layout as React.FunctionComponent, {}, pageElement)
				: pageElement;

			const HtmlTemplate = await this.getHtmlTemplate();
			const metadata: PageMetadataProps = view.metadata
				? await view.metadata({
						params: {},
						query: {},
						props,
						appConfig: this.appConfig,
					})
				: this.appConfig.defaultMetadata;

			await this.prepareViewDependencies(view, Layout as unknown as EcoComponent | undefined);

			const viewFilePath = viewConfig?.__eco?.file;
			if (viewFilePath) {
				const hydrationAssets = await this.buildRouteRenderAssets(viewFilePath);
				this.htmlTransformer.setProcessedDependencies([
					...this.htmlTransformer.getProcessedDependencies(),
					...hydrationAssets,
				]);
			}

			const streamBody = await renderToReadableStream(
				createElement(
					HtmlTemplate,
					{
						metadata,
						pageProps: props,
					} as HtmlTemplateProps,
					contentElement,
				),
			);

			const transformedResponse = await this.htmlTransformer.transform(
				new Response(streamBody, {
					headers: { 'Content-Type': 'text/html' },
				}),
			);

			return this.createHtmlResponse(transformedResponse.body ?? '', ctx);
		} catch (error) {
			throw this.createRenderError('Failed to render view', error);
		}
	}
}
