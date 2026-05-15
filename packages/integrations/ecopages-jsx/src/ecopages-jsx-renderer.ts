import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
} from '@ecopages/core';
import {
	IntegrationRenderer,
	type RenderToResponseContext,
	type RouteModuleLoadOptions,
} from '@ecopages/core/route-renderer/integration-renderer';
import type { ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import { createMarkupNodeLike, type JsxRenderable } from '@ecopages/jsx';
import { renderToString, withServerCustomElementRenderHook } from '@ecopages/jsx/server';
import { ECOPAGES_JSX_PLUGIN_NAME } from './ecopages-jsx.constants.ts';
import {
	isMdxFile,
	normalizeMdxPageModule,
	type AsyncEcoComponent,
	type EcopagesJsxMdxPageModule,
} from './ecopages-jsx-mdx.ts';
import { EcopagesJsxRenderSession } from './ecopages-jsx-render-session.ts';
import { EcopagesJsxRadiantSsrPolicy } from './ecopages-jsx-radiant-ssr-policy.ts';
import type { EcopagesJsxRendererOptions } from './ecopages-jsx.types.ts';

export type { EcopagesJsxRendererConfig, EcopagesJsxRendererOptions } from './ecopages-jsx.types.ts';

type EcopagesJsxForeignSubtreeResolutionContext = {
	rendererCache: Map<string, IntegrationRenderer<any>>;
	componentInstanceScope?: string;
	nextForeignSubtreeId: number;
	queuedResolutions: Array<{
		token: string;
		component: EcoComponent;
		props: Record<string, unknown>;
		componentInstanceId: string;
	}>;
};

/**
 * Local Ecopages renderer for JSX templates in the docs app.
 *
 * This keeps the integration scoped to the docs package while supporting
 * async page, layout, and html template components on the server.
 */
export class EcopagesJsxRenderer extends IntegrationRenderer<JsxRenderable> {
	name = ECOPAGES_JSX_PLUGIN_NAME;
	private readonly mdxExtensions: string[];
	private readonly renderSession: EcopagesJsxRenderSession;
	private readonly radiantSsrPolicy: EcopagesJsxRadiantSsrPolicy;

	private normalizeForeignChildProps(props: Record<string, unknown>): Record<string, unknown> {
		if (!('children' in props)) {
			return props;
		}

		const children = props.children;
		if (children === undefined || typeof children === 'string') {
			return props;
		}

		if (
			typeof children === 'object' &&
			children !== null &&
			'nodeType' in children &&
			typeof (children as { nodeType: unknown }).nodeType === 'number' &&
			'outerHTML' in children &&
			typeof (children as { outerHTML: unknown }).outerHTML === 'string'
		) {
			return {
				...props,
				children: (children as { outerHTML: string }).outerHTML,
			};
		}

		return {
			...props,
			children: renderToString(children as JsxRenderable),
		};
	}

	/**
	 * Re-renders queued JSX children inside the owning renderer so nested custom
	 * elements and queued foreign subtrees contribute assets to the same frame.
	 */
	private async renderQueuedForeignSubtreeChildren(
		children: unknown,
		queuedResolutionsByToken: Map<string, EcopagesJsxForeignSubtreeResolutionContext['queuedResolutions'][number]>,
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
		html = await this.foreignSubtreeExecutionService.resolveQueuedTokens(
			html,
			queuedResolutionsByToken,
			resolveToken,
		);

		return {
			assets,
			html,
		};
	}

	/**
	 * Resolves queued foreign subtrees after JSX has been stringified.
	 *
	 * JSX content needs one extra render pass because child foreign subtrees may emit
	 * additional browser assets while also replacing placeholder tokens.
	 */
	private async resolveOwnedForeignSubtreeHtml(
		html: string,
		runtimeContext: EcopagesJsxForeignSubtreeResolutionContext | undefined,
	): Promise<{ assets: ProcessedAsset[]; html: string }> {
		return this.foreignSubtreeExecutionService.resolveQueuedHtml({
			currentIntegrationName: this.name,
			html,
			runtimeContext,
			queueLabel: 'Ecopages JSX',
			getOwningRenderer: (integrationName, rendererCache) =>
				this.getIntegrationRendererForName(integrationName, rendererCache),
			applyAttributesToFirstElement: (resolvedHtml, attributes) =>
				this.htmlTransformer.applyAttributesToFirstElement(resolvedHtml, attributes),
			dedupeProcessedAssets: (assets) => this.htmlTransformer.dedupeProcessedAssets(assets),
			renderQueuedChildren: async (children, _runtimeContext, queuedResolutionsByToken, resolveToken) =>
				this.renderQueuedForeignSubtreeChildren(children, queuedResolutionsByToken, resolveToken),
		});
	}

	protected override createForeignChildRuntime(options: {
		renderInput: ComponentRenderInput;
		rendererCache: Map<string, IntegrationRenderer<any>>;
	}) {
		const runtime = super.createForeignChildRuntime(options);
		const wrapInput = (input: ForeignChildInterceptionInput): ForeignChildInterceptionInput => ({
			...input,
			props:
				input.targetIntegration && input.targetIntegration !== this.name
					? this.normalizeForeignChildProps(input.props)
					: input.props,
		});

		return {
			interceptForeignChild: runtime.interceptForeignChild
				? (input) => runtime.interceptForeignChild(wrapInput(input))
				: undefined,
			interceptForeignChildSync: runtime.interceptForeignChildSync
				? (input) => runtime.interceptForeignChildSync(wrapInput(input))
				: undefined,
		};
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

		this.mdxExtensions = jsxConfig?.mdxExtensions ?? ['.mdx'];
		this.renderSession = new EcopagesJsxRenderSession((assets) =>
			this.htmlTransformer.dedupeProcessedAssets(assets),
		);
		this.radiantSsrPolicy =
			jsxConfig?.radiantSsrPolicy ?? new EcopagesJsxRadiantSsrPolicy(jsxConfig?.radiantSsrEnabled ?? false);
	}

	/** Returns whether the requested page file should be treated as MDX. */
	public isMdxFile(filePath: string): boolean {
		return isMdxFile(filePath, this.mdxExtensions);
	}

	protected override async importPageFile(
		file: string,
		options?: RouteModuleLoadOptions,
	): Promise<EcopagesJsxMdxPageModule> {
		await this.radiantSsrPolicy.prepareRuntime();

		const module = (await super.importPageFile(file, options)) as EcopagesJsxMdxPageModule;

		return this.isMdxFile(file) ? normalizeMdxPageModule(file, module) : module;
	}

	override async render(options: IntegrationRendererRenderOptions<JsxRenderable>): Promise<RouteRendererBody> {
		await this.radiantSsrPolicy.prepareRuntime();

		return await this.renderSession.withActiveScope(async () => {
			try {
				return await this.renderPageWithDocumentShell({
					page: {
						component: options.Page,
						props: {
							...options.pageProps,
							locals: options.pageLocals,
						},
					},
					layout: options.Layout
						? {
								component: options.Layout,
								props: {
									...options.pageProps,
									locals: options.locals,
								},
							}
						: undefined,
					htmlTemplate: options.HtmlTemplate,
					metadata: options.metadata,
					pageProps: options.pageProps ?? {},
				});
			} catch (error) {
				throw this.createRenderError('Error rendering page', error);
			}
		});
	}

	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		await this.radiantSsrPolicy.prepareRuntime();

		return await this.renderSession.withActiveScope(async () => {
			const assetFrame = this.renderSession.beginCollectedAssetFrame();

			try {
				if (typeof input.component !== 'function') {
					throw new TypeError('JSX renderer expected a callable component.');
				}
				const component = input.component as AsyncEcoComponent<Record<string, unknown>>;

				const componentProps =
					input.children === undefined
						? input.props
						: {
								...input.props,
								children:
									typeof input.children === 'string'
										? createMarkupNodeLike(input.children)
										: input.children,
							};
				const componentAssetsFromRender: ProcessedAsset[] = [];
				const content = await this.withCustomElementRenderHook(componentAssetsFromRender, () =>
					component(componentProps),
				);
				this.renderSession.recordCollectedAssets(componentAssetsFromRender);
				const rendered = await this.renderJsx(content);
				const queuedForeignSubtreeResolution = await this.resolveOwnedForeignSubtreeHtml(
					rendered.html,
					this.getQueuedForeignSubtreeResolutionContext<EcopagesJsxForeignSubtreeResolutionContext>(input),
				);
				const componentAssets =
					input.component.config?.dependencies &&
					typeof this.assetProcessingService?.processDependencies === 'function'
						? await this.processComponentDependencies([input.component])
						: [];
				const assets = this.htmlTransformer.dedupeProcessedAssets([
					...this.renderSession.endCollectedAssetFrame(assetFrame),
					...queuedForeignSubtreeResolution.assets,
					...componentAssets,
				]);

				return {
					html: queuedForeignSubtreeResolution.html,
					canAttachAttributes: true,
					rootTag: this.getRootTagName(queuedForeignSubtreeResolution.html),
					integrationName: this.name,
					assets,
				};
			} catch (error) {
				this.renderSession.endCollectedAssetFrame(assetFrame);
				throw this.createRenderError('Error rendering component', error);
			}
		});
	}

	override async renderToResponse<P = any>(
		view: EcoComponent<P>,
		props: P,
		ctx: RenderToResponseContext,
	): Promise<Response> {
		await this.radiantSsrPolicy.prepareRuntime();

		return await this.renderSession.withActiveScope(async () => {
			try {
				if (typeof view !== 'function') {
					throw new TypeError('JSX renderer expected a callable view component.');
				}
				const viewComponent = view as AsyncEcoComponent<Record<string, unknown>>;

				return await this.renderViewWithDocumentShell({
					view: viewComponent,
					props: props as Record<string, unknown>,
					ctx,
					layout: viewComponent.config?.layout,
				});
			} catch (error) {
				throw this.createRenderError('Error rendering view', error);
			}
		});
	}

	private async renderJsx(value: JsxRenderable): Promise<{ assets: ProcessedAsset[]; html: string }> {
		const collectedAssets: ProcessedAsset[] = [];
		const html = await this.withCustomElementRenderHook(collectedAssets, () =>
			renderToString(value, { mode: 'hydrate' }),
		);
		const dedupedAssets = this.renderSession.recordCollectedAssets(collectedAssets);

		return {
			assets: dedupedAssets,
			html,
		};
	}

	private async withCustomElementRenderHook<T>(target: ProcessedAsset[], render: () => T): Promise<T> {
		await this.radiantSsrPolicy.prepareRuntime();

		return await this.radiantSsrPolicy.withRuntime(() =>
			withServerCustomElementRenderHook(this.createIntrinsicCustomElementRenderHook(target), render),
		);
	}

	private createIntrinsicCustomElementRenderHook(_target: ProcessedAsset[]) {
		return ({ instance }: { instance?: unknown; tagName: string }) => {
			return instance ? this.radiantSsrPolicy.renderIntrinsicElementMarkup(instance) : undefined;
		};
	}
}
