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
import type { EcoPagesAppConfig } from '@ecopages/core/internal-types';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import type { AssetProcessingService, ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import { createMarkupNodeLike, type JsxRenderable } from '@ecopages/jsx';
import { renderToString, withServerCustomElementRenderHook } from '@ecopages/jsx/server';
import { ECOPAGES_JSX_PLUGIN_NAME } from './ecopages-jsx.plugin.ts';

let radiantLightDomShimInstallPromise: Promise<void> | undefined;

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

async function ensureRadiantLightDomShimInstalled(): Promise<void> {
	if (!radiantLightDomShimInstallPromise) {
		radiantLightDomShimInstallPromise = import('@ecopages/radiant/server/light-dom-shim')
			.then((module) => {
				module.installLightDomShim();
			})
			.then(() => undefined);
	}

	await radiantLightDomShimInstallPromise;
}

type AsyncEcoComponent<P = Record<string, unknown>, R = JsxRenderable> = EcoComponent<P, R | Promise<R>>;
type MdxPageModule = EcoPageFile<{
	config?: EcoComponentConfig;
	layout?: EcoComponent;
	getMetadata?: GetMetadata;
}>;

const isEcoFunctionComponent = (component: EcoComponent): component is EcoFunctionComponent<any, any> => {
	return typeof component === 'function';
};

const renderComponent = async <P>(component: AsyncEcoComponent<P>, props: P): Promise<JsxRenderable> => {
	return (await (component as (props: P) => JsxRenderable | Promise<JsxRenderable>)(props)) as JsxRenderable;
};

const createEcoMeta = (file: string): NonNullable<EcoComponentConfig['__eco']> => ({
	id: String(rapidhash(file)),
	file,
	integration: ECOPAGES_JSX_PLUGIN_NAME,
});

const wrapMdxPage = (
	page: AsyncEcoComponent<Record<string, unknown>>,
	{
		config,
		metadata,
	}: {
		config: EcoComponentConfig;
		metadata?: GetMetadata;
	},
): AsyncEcoComponent<Record<string, unknown>> => {
	const wrappedPage = (async (props: Record<string, unknown>) => renderComponent(page, props)) as AsyncEcoComponent<
		Record<string, unknown>
	>;

	wrappedPage.config = config;

	if (metadata) {
		wrappedPage.metadata = metadata;
	}

	return wrappedPage;
};

/**
 * Local Ecopages renderer for JSX templates in the docs app.
 *
 * This keeps the integration scoped to the docs package while supporting
 * async page, layout, and html template components on the server.
 */
export class EcopagesJsxRenderer extends IntegrationRenderer<JsxRenderable> {
	name = ECOPAGES_JSX_PLUGIN_NAME;

	static mdxExtensions = ['.mdx'];
	private intrinsicCustomElementAssets = new Map<string, readonly ProcessedAsset[]>();
	private collectedAssetFrames: ProcessedAsset[][] = [];
	private radiantSsrEnabled = false;

	private async resolveQueuedBoundaryChildren(
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

	private async resolveQueuedBoundaryHtml(
		html: string,
		runtimeContext: EcopagesJsxBoundaryRuntimeContext | undefined,
	): Promise<{ assets: ProcessedAsset[]; html: string }> {
		return this.resolveRendererOwnedQueuedBoundaryHtml({
			html,
			runtimeContext,
			queueLabel: 'Ecopages JSX',
			renderQueuedChildren: async (children, _runtimeContext, queuedResolutionsByToken, resolveToken) =>
				this.resolveQueuedBoundaryChildren(children, queuedResolutionsByToken, resolveToken),
		});
	}

	constructor({
		appConfig,
		assetProcessingService,
		resolvedIntegrationDependencies,
		runtimeOrigin,
	}: {
		appConfig: EcoPagesAppConfig;
		assetProcessingService: AssetProcessingService;
		resolvedIntegrationDependencies: ProcessedAsset[];
		runtimeOrigin: string;
	}) {
		super({
			appConfig,
			assetProcessingService,
			resolvedIntegrationDependencies,
			runtimeOrigin,
		});
	}

	/** Returns whether the requested page file should be treated as MDX. */
	public isMdxFile(filePath: string): boolean {
		return EcopagesJsxRenderer.mdxExtensions.some((ext) => filePath.endsWith(ext));
	}

	/**
	 * Supplies the intrinsic custom-element assets discovered by the plugin so
	 * component renders can attach the correct client scripts.
	 */
	public setIntrinsicCustomElementAssets(assetsByTagName: Map<string, readonly ProcessedAsset[]>): void {
		this.intrinsicCustomElementAssets = assetsByTagName;
	}

	/** Enables the Radiant SSR light-DOM shim for this renderer instance. */
	public setRadiantSsrEnabled(enabled: boolean): void {
		this.radiantSsrEnabled = enabled;
	}

	protected override async importPageFile(file: string): Promise<MdxPageModule> {
		const module = (await super.importPageFile(file)) as MdxPageModule;

		if (!this.isMdxFile(file)) {
			return module;
		}

		const Page = module.default as EcoComponent;
		const normalizedConfig: EcoComponentConfig = {
			...(module.config ?? Page.config ?? {}),
			...(module.layout ? { layout: module.layout } : {}),
			__eco: module.config?.__eco ?? Page.config?.__eco ?? createEcoMeta(file),
		};
		const wrappedPage = wrapMdxPage(Page as AsyncEcoComponent<Record<string, unknown>>, {
			config: normalizedConfig,
			metadata: module.getMetadata ?? Page.metadata,
		});

		return {
			...module,
			default: wrappedPage,
			config: normalizedConfig,
		};
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
			if (!isEcoFunctionComponent(input.component)) {
				throw new TypeError('JSX renderer expected a callable component.');
			}

			let props = input.props;
			if (input.children !== undefined) {
				props = {
					...input.props,
					children:
						typeof input.children === 'string' ? createMarkupNodeLike(input.children) : input.children,
				};
			}
			const content = await this.renderEcoComponent(
				input.component as AsyncEcoComponent<Record<string, unknown>>,
				props,
			);
			const rendered = await this.renderJsx(content);
			const queuedBoundaryResolution = await this.resolveQueuedBoundaryHtml(
				rendered.html,
				this.getQueuedBoundaryRuntime<EcopagesJsxBoundaryRuntimeContext>(input),
			);
			const componentAssets =
				input.component.config?.dependencies &&
				typeof this.assetProcessingService?.processDependencies === 'function'
					? await this.processComponentDependencies([input.component])
					: [];
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
			if (!isEcoFunctionComponent(view)) {
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
			await ensureRadiantLightDomShimInstalled();
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
			await ensureRadiantLightDomShimInstalled();
		}

		const collectedAssets: ProcessedAsset[] = [];
		const rendered = await withServerCustomElementRenderHook(
			this.createIntrinsicCustomElementRenderHook(collectedAssets),
			() => renderComponent(component, props),
		);
		const activeFrame = this.collectedAssetFrames[this.collectedAssetFrames.length - 1];

		if (activeFrame) {
			activeFrame.push(...this.htmlTransformer.dedupeProcessedAssets(collectedAssets));
		}

		return rendered;
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
