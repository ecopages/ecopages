import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoFunctionComponent,
	EcoComponentConfig,
	EcoPageFile,
	GetMetadata,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
} from '@ecopages/core';
import { rapidhash } from '@ecopages/core/hash';
import {
	IntegrationRenderer,
	type RenderToResponseContext,
	type RouteModuleLoadOptions,
} from '@ecopages/core/route-renderer/integration-renderer';
import type { ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import { createMarkupNodeLike, type JsxRenderable } from '@ecopages/jsx';
import { renderToString, withServerCustomElementRenderHook } from '@ecopages/jsx/server';
import { ECOPAGES_JSX_PLUGIN_NAME } from './ecopages-jsx.plugin.ts';
import type { EcopagesJsxRendererOptions } from './ecopages-jsx.types.ts';

export type { EcopagesJsxRendererConfig, EcopagesJsxRendererOptions } from './ecopages-jsx.types.ts';

type EcopagesJsxBoundaryRuntimeContext = {
	rendererCache: Map<string, IntegrationRenderer<any>>;
	componentInstanceScope?: string;
	nextBoundaryId: number;
	queuedResolutions: Array<{
		token: string;
		component: EcoComponent;
		props: Record<string, unknown>;
		componentInstanceId: string;
	}>;
};

type AsyncEcoComponent<P = Record<string, unknown>, R = JsxRenderable> = EcoComponent<P, R | Promise<R>>;
type MdxPageModule = EcoPageFile<{
	config?: EcoComponentConfig;
	layout?: EcoComponent;
	getMetadata?: GetMetadata;
}>;

/**
 * Local Ecopages renderer for JSX templates in the docs app.
 *
 * This keeps the integration scoped to the docs package while supporting
 * async page, layout, and html template components on the server.
 */
export class EcopagesJsxRenderer extends IntegrationRenderer<JsxRenderable> {
	name = ECOPAGES_JSX_PLUGIN_NAME;

	private static radiantLightDomShimInstallPromise: Promise<void> | undefined;

	private readonly intrinsicCustomElementAssets: Map<string, readonly ProcessedAsset[]>;
	private collectedAssetFrames: ProcessedAsset[][] = [];
	private readonly mdxExtensions: string[];
	private readonly radiantSsrEnabled: boolean;

	/**
	 * Re-renders queued JSX children inside the owning renderer so nested custom
	 * elements and queued foreign boundaries contribute assets to the same frame.
	 */
	private async renderQueuedBoundaryChildren(
		children: unknown,
		queuedResolutionsByToken: Map<string, EcopagesJsxBoundaryRuntimeContext['queuedResolutions'][number]>,
		resolveToken: (token: string) => Promise<string>,
	): Promise<{ assets: ProcessedAsset[]; html?: string }> {
		if (children === undefined) {
			return { assets: [] };
		}

		let assets: ProcessedAsset[] = [];
		let html: string;

		if (typeof children === 'string') {
			html = children;
		} else {
			const renderedChildren = await this.renderJsx(children as JsxRenderable);
			html = renderedChildren.html;
			assets = renderedChildren.assets;
		}
		html = await this.resolveQueuedBoundaryTokens(html, queuedResolutionsByToken, resolveToken);

		return {
			assets,
			html,
		};
	}

	/**
	 * Resolves queued foreign boundaries after JSX has been stringified.
	 *
	 * JSX content needs one extra render pass because child boundaries may emit
	 * additional browser assets while also replacing placeholder tokens.
	 */
	private async resolveOwnedBoundaryHtml(
		html: string,
		runtimeContext: EcopagesJsxBoundaryRuntimeContext | undefined,
	): Promise<{ assets: ProcessedAsset[]; html: string }> {
		return this.resolveRendererOwnedQueuedBoundaryHtml({
			html,
			runtimeContext,
			queueLabel: 'Ecopages JSX',
			renderQueuedChildren: async (children, _runtimeContext, queuedResolutionsByToken, resolveToken) =>
				this.renderQueuedBoundaryChildren(children, queuedResolutionsByToken, resolveToken),
		});
	}

	constructor({
		appConfig,
		assetProcessingService,
		resolvedIntegrationDependencies,
		jsxConfig,
		runtimeOrigin,
	}: EcopagesJsxRendererOptions) {
		super({
			appConfig,
			assetProcessingService,
			resolvedIntegrationDependencies,
			runtimeOrigin,
		});

		this.intrinsicCustomElementAssets = jsxConfig?.intrinsicCustomElementAssets ?? new Map();
		this.mdxExtensions = jsxConfig?.mdxExtensions ?? ['.mdx'];
		this.radiantSsrEnabled = jsxConfig?.radiantSsrEnabled ?? false;
	}

	/** Returns whether the requested page file should be treated as MDX. */
	public isMdxFile(filePath: string): boolean {
		return this.mdxExtensions.some((ext) => filePath.endsWith(ext));
	}

	protected override async importPageFile(file: string, options?: RouteModuleLoadOptions): Promise<MdxPageModule> {
		if (this.radiantSsrEnabled) {
			await this.ensureRadiantLightDomShimInstalled();
		}

		const module = (await super.importPageFile(file, options)) as MdxPageModule;

		return this.isMdxFile(file) ? this.normalizeMdxPageModule(file, module) : module;
	}

	override async render(options: IntegrationRendererRenderOptions<JsxRenderable>): Promise<RouteRendererBody> {
		try {
			return await this.renderPageWithDocumentShell({
				page: {
					component: options.Page as EcoComponent,
					props: {
						...options.pageProps,
						locals: options.pageLocals,
					},
				},
				layout: options.Layout
					? {
							component: options.Layout as EcoComponent,
							props: {
								...options.pageProps,
								locals: options.locals,
							},
						}
					: undefined,
				htmlTemplate: options.HtmlTemplate as EcoComponent,
				metadata: options.metadata,
				pageProps: options.pageProps ?? {},
			});
		} catch (error) {
			throw this.createRenderError('Error rendering page', error);
		}
	}

	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		const assetFrame = this.beginCollectedAssetFrame();

		try {
			if (!this.isFunctionComponent(input.component)) {
				throw new TypeError('JSX renderer expected a callable component.');
			}

			const content = await this.renderEcoComponent(
				input.component as AsyncEcoComponent<Record<string, unknown>>,
				this.createComponentProps(input),
			);
			const rendered = await this.renderJsx(content);
			const queuedBoundaryResolution = await this.resolveOwnedBoundaryHtml(
				rendered.html,
				this.getQueuedBoundaryRuntime<EcopagesJsxBoundaryRuntimeContext>(input),
			);
			const componentAssets = await this.collectComponentAssets(input.component);
			const assets = this.htmlTransformer.dedupeProcessedAssets([
				...this.endCollectedAssetFrame(assetFrame),
				...queuedBoundaryResolution.assets,
				...componentAssets,
			]);

			return {
				html: queuedBoundaryResolution.html,
				canAttachAttributes: true,
				rootTag: this.getRootTagName(queuedBoundaryResolution.html),
				integrationName: this.name,
				assets,
			};
		} catch (error) {
			this.endCollectedAssetFrame(assetFrame);
			throw this.createRenderError('Error rendering component', error);
		}
	}

	protected override createComponentBoundaryRuntime(options: {
		boundaryInput: ComponentRenderInput;
		rendererCache: Map<string, IntegrationRenderer<any>>;
	}) {
		return this.createQueuedBoundaryRuntime<EcopagesJsxBoundaryRuntimeContext>({
			boundaryInput: options.boundaryInput,
			rendererCache: options.rendererCache,
		});
	}

	override async renderToResponse<P = any>(
		view: EcoComponent<P>,
		props: P,
		ctx: RenderToResponseContext,
	): Promise<Response> {
		try {
			if (!this.isFunctionComponent(view)) {
				throw new TypeError('JSX renderer expected a callable view component.');
			}

			return await this.renderViewWithDocumentShell({
				view,
				props,
				ctx,
				layout: view.config?.layout,
			});
		} catch (error) {
			throw this.createRenderError('Error rendering view', error);
		}
	}

	/**
	 * Normalizes MDX modules into the same page contract as JSX route modules.
	 *
	 * MDX files export page metadata alongside generated component code, so the
	 * renderer folds those exports back into the Ecopages component shape before
	 * any layout or document-shell logic runs.
	 */
	private normalizeMdxPageModule(file: string, module: MdxPageModule): MdxPageModule {
		const Page = module.default as EcoComponent;
		const normalizedConfig: EcoComponentConfig = {
			...(module.config ?? Page.config ?? {}),
			...(module.layout ? { layout: module.layout } : {}),
			__eco: module.config?.__eco ?? Page.config?.__eco ?? this.createEcoMeta(file),
		};
		const wrappedPage = this.wrapMdxPage(Page as AsyncEcoComponent<Record<string, unknown>>, {
			config: normalizedConfig,
			metadata: module.getMetadata ?? Page.metadata,
		});

		return {
			...module,
			default: wrappedPage,
			config: normalizedConfig,
		};
	}

	private beginCollectedAssetFrame(): ProcessedAsset[] {
		const frame: ProcessedAsset[] = [];
		this.collectedAssetFrames.push(frame);
		return frame;
	}

	private endCollectedAssetFrame(frame: ProcessedAsset[]): ProcessedAsset[] {
		const activeFrame = this.collectedAssetFrames.pop();

		if (!activeFrame || activeFrame !== frame) {
			return this.htmlTransformer.dedupeProcessedAssets(frame);
		}

		return this.htmlTransformer.dedupeProcessedAssets(activeFrame);
	}

	private async renderJsx(value: JsxRenderable): Promise<{ assets: ProcessedAsset[]; html: string }> {
		if (this.radiantSsrEnabled) {
			await this.ensureRadiantLightDomShimInstalled();
		}

		const collectedAssets: ProcessedAsset[] = [];
		const html = withServerCustomElementRenderHook(
			this.createIntrinsicCustomElementRenderHook(collectedAssets),
			() => renderToString(value),
		);
		const dedupedAssets = this.htmlTransformer.dedupeProcessedAssets(collectedAssets);
		const activeFrame = this.collectedAssetFrames[this.collectedAssetFrames.length - 1];

		if (activeFrame) {
			activeFrame.push(...dedupedAssets);
		}

		return {
			assets: dedupedAssets,
			html,
		};
	}

	private async renderEcoComponent<P>(component: AsyncEcoComponent<P>, props: P): Promise<JsxRenderable> {
		if (this.radiantSsrEnabled) {
			await this.ensureRadiantLightDomShimInstalled();
		}

		const collectedAssets: ProcessedAsset[] = [];
		const rendered = await withServerCustomElementRenderHook(
			this.createIntrinsicCustomElementRenderHook(collectedAssets),
			() => this.invokeComponent(component, props),
		);
		const activeFrame = this.collectedAssetFrames[this.collectedAssetFrames.length - 1];

		if (activeFrame) {
			activeFrame.push(...this.htmlTransformer.dedupeProcessedAssets(collectedAssets));
		}

		return rendered;
	}

	private async ensureRadiantLightDomShimInstalled(): Promise<void> {
		if (!EcopagesJsxRenderer.radiantLightDomShimInstallPromise) {
			EcopagesJsxRenderer.radiantLightDomShimInstallPromise = import('@ecopages/radiant/server/light-dom-shim')
				.then((module) => {
					module.installLightDomShim();
				})
				.then(() => undefined);
		}

		await EcopagesJsxRenderer.radiantLightDomShimInstallPromise;
	}

	private isFunctionComponent(component: EcoComponent): component is EcoFunctionComponent<any, any> {
		return typeof component === 'function';
	}

	private createComponentProps(input: ComponentRenderInput): Record<string, unknown> {
		if (input.children === undefined) {
			return input.props;
		}

		return {
			...input.props,
			children: typeof input.children === 'string' ? createMarkupNodeLike(input.children) : input.children,
		};
	}

	private async collectComponentAssets(component: EcoComponent): Promise<ProcessedAsset[]> {
		if (!component.config?.dependencies || typeof this.assetProcessingService?.processDependencies !== 'function') {
			return [];
		}

		return this.processComponentDependencies([component]);
	}

	private async invokeComponent<P>(component: AsyncEcoComponent<P>, props: P): Promise<JsxRenderable> {
		return (await (component as (props: P) => JsxRenderable | Promise<JsxRenderable>)(props)) as JsxRenderable;
	}

	private createEcoMeta(file: string): NonNullable<EcoComponentConfig['__eco']> {
		return {
			id: String(rapidhash(file)),
			file,
			integration: ECOPAGES_JSX_PLUGIN_NAME,
		};
	}

	private wrapMdxPage(
		page: AsyncEcoComponent<Record<string, unknown>>,
		{
			config,
			metadata,
		}: {
			config: EcoComponentConfig;
			metadata?: GetMetadata;
		},
	): AsyncEcoComponent<Record<string, unknown>> {
		const wrappedPage = (async (props: Record<string, unknown>) =>
			this.invokeComponent(page, props)) as AsyncEcoComponent<Record<string, unknown>>;

		wrappedPage.config = config;

		if (metadata) {
			wrappedPage.metadata = metadata;
		}

		return wrappedPage;
	}

	private createIntrinsicCustomElementRenderHook(target: ProcessedAsset[]) {
		return ({ tagName }: { tagName: string }) => {
			const assets = this.intrinsicCustomElementAssets.get(tagName);

			if (assets) {
				target.push(...assets);
			}

			return undefined;
		};
	}
}
