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
} from '@ecopages/core/route-renderer/orchestration/integration-renderer';
import type {
	ForeignSubtreeExecutionOwningRenderer,
	QueuedForeignSubtreeResolutionContext,
} from '@ecopages/core/route-renderer/orchestration/foreign-child/foreign-subtree-execution.service';
import {
	getForeignSubtreeResolutionContextKey,
	resolveOwningIntegrationRenderer,
} from '@ecopages/core/route-renderer/orchestration/foreign-child/owning-renderer-resolution';
import type {
	ForeignChildInterceptionInput,
	ForeignChildRuntime,
} from '@ecopages/core/route-renderer/orchestration/foreign-child/component-render-context';
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

	/**
	 * Serializes foreign-child props for string-first boundaries.
	 *
	 * @remarks
	 * DOM nodes become `outerHTML`. JSX trees, arrays, and template results are
	 * stringified here. Other values are left for core foreign-child interception,
	 * which rejects opaque plain objects before queueing. Cross-integration
	 * children must use `EcoEmbed`.
	 */
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

		if (this.isJsxSerializableForeignChild(children)) {
			return {
				...props,
				children: renderToString(children as JsxRenderable),
			};
		}

		return props;
	}

	/**
	 * Returns whether children are a JSX/template shape this renderer can
	 * serialize before foreign-child queueing.
	 */
	private isJsxSerializableForeignChild(children: unknown): boolean {
		if (Array.isArray(children)) {
			return true;
		}

		if (children === null || typeof children !== 'object') {
			return false;
		}

		if ('$$typeof' in children) {
			return true;
		}

		return 'strings' in children && Array.isArray((children as { strings: unknown }).strings);
	}

	/**
	 * Re-renders queued JSX children inside the owning renderer so nested custom
	 * elements and queued foreign subtrees contribute assets to the same frame.
	 */
	private async renderQueuedForeignSubtreeChildren(
		children: unknown,
		queuedResolutionsByToken: Map<string, QueuedForeignSubtreeResolutionContext['queuedResolutions'][number]>,
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

	protected override createForeignChildRuntime(options: {
		renderInput: ComponentRenderInput;
		rendererCache: Map<string, IntegrationRenderer<any>>;
	}): ForeignChildRuntime {
		const runtime = super.createForeignChildRuntime(options);
		const interceptForeignChild = runtime.interceptForeignChild;
		const interceptForeignChildSync = runtime.interceptForeignChildSync;
		const wrapInput = (input: ForeignChildInterceptionInput): ForeignChildInterceptionInput => ({
			...input,
			props:
				input.targetIntegration && input.targetIntegration !== this.name
					? this.normalizeForeignChildProps(input.props)
					: input.props,
		});

		return {
			interceptForeignChild: interceptForeignChild
				? (input: ForeignChildInterceptionInput) => interceptForeignChild(wrapInput(input))
				: undefined,
			interceptForeignChildSync: interceptForeignChildSync
				? (input: ForeignChildInterceptionInput) => interceptForeignChildSync(wrapInput(input))
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
		return await this.withPreparedRadiantRuntime(async () => {
			const module = (await super.importPageFile(file, options)) as EcopagesJsxMdxPageModule;

			return this.isMdxFile(file) ? normalizeMdxPageModule(file, module) : module;
		});
	}

	override async render(options: IntegrationRendererRenderOptions<JsxRenderable>): Promise<RouteRendererBody> {
		return await this.withPreparedRadiantRuntime(
			async () =>
				await this.renderSession.withActiveScope(async () => {
					try {
						const result = await this.renderPageWithDocumentShell({
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

						this.recordHmrOwnership([options.Page, options.Layout, options.HtmlTemplate]);

						return result;
					} catch (error) {
						throw this.createRenderError('Error rendering page', error);
					}
				}),
		);
	}

	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		return await this.withPreparedRadiantRuntime(
			async () =>
				await this.renderSession.withActiveScope(async () => {
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
						const content = await this.withCustomElementRenderHook(() => component(componentProps));
						const rendered = await this.renderJsx(content);
						const queuedForeignSubtreeResolution =
							await this.foreignSubtreeExecutionService.resolveQueuedHtml({
								currentIntegrationName: this.name,
								html: rendered.html,
								runtimeContext:
									this.foreignSubtreeExecutionService.getQueuedRuntimeContext<QueuedForeignSubtreeResolutionContext>(
										input,
										getForeignSubtreeResolutionContextKey(this.name),
									),
								queueLabel: 'Ecopages JSX',
								getOwningRenderer: (integrationName, rendererCache) =>
									resolveOwningIntegrationRenderer({
										appConfig: this.appConfig,
										runtimeOrigin: this.runtimeOrigin,
										currentIntegrationName: this.name,
										currentRenderer: this,
										integrationName,
										cache: rendererCache as Map<string, ForeignSubtreeExecutionOwningRenderer>,
									}),
								applyAttributesToFirstElement: (resolvedHtml, attributes) =>
									this.htmlTransformer.applyAttributesToFirstElement(resolvedHtml, attributes),
								dedupeProcessedAssets: (assets) => this.htmlTransformer.dedupeProcessedAssets(assets),
								renderQueuedChildren: (
									children,
									_runtimeContext,
									queuedResolutionsByToken,
									resolveToken,
								) =>
									this.renderQueuedForeignSubtreeChildren(
										children,
										queuedResolutionsByToken,
										resolveToken,
									),
							});
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

						this.recordHmrOwnership([input.component as EcoComponent]);

						return this.finalizeIslandComponentRender(input, {
							html: queuedForeignSubtreeResolution.html,
							canAttachAttributes: true,
							rootTag: this.getRootTagName(queuedForeignSubtreeResolution.html),
							integrationName: this.name,
							assets,
						});
					} catch (error) {
						this.renderSession.endCollectedAssetFrame(assetFrame);
						throw this.createRenderError('Error rendering component', error);
					}
				}),
		);
	}

	override async renderToResponse<P = any>(
		view: EcoComponent<P>,
		props: P,
		ctx: RenderToResponseContext,
	): Promise<Response> {
		return await this.withPreparedRadiantRuntime(
			async () =>
				await this.renderSession.withActiveScope(async () => {
					try {
						if (typeof view !== 'function') {
							throw new TypeError('JSX renderer expected a callable view component.');
						}
						const viewComponent = view as AsyncEcoComponent<Record<string, unknown>>;
						const layouts = viewComponent.config?.layouts;

						const response = await this.renderViewWithDocumentShell({
							view: viewComponent,
							props: props as Record<string, unknown>,
							ctx,
							layout: layouts?.[layouts.length - 1],
						});

						this.recordHmrOwnership([view as EcoComponent]);

						return response;
					} catch (error) {
						throw this.createRenderError('Error rendering view', error);
					}
				}),
		);
	}

	private async renderJsx(value: JsxRenderable): Promise<{ assets: ProcessedAsset[]; html: string }> {
		const collectedAssets: ProcessedAsset[] = [];
		const html = await this.withCustomElementRenderHook(() => renderToString(value));
		const dedupedAssets = this.renderSession.recordCollectedAssets(collectedAssets);

		return {
			assets: dedupedAssets,
			html,
		};
	}

	private async withCustomElementRenderHook<T>(render: () => T): Promise<T> {
		return await this.radiantSsrPolicy.withRuntime(() =>
			withServerCustomElementRenderHook(this.createIntrinsicCustomElementRenderHook(), render),
		);
	}

	private async withPreparedRadiantRuntime<T>(render: () => Promise<T>): Promise<T> {
		await this.radiantSsrPolicy.prepareRuntime();
		return await render();
	}

	private createIntrinsicCustomElementRenderHook() {
		return ({ instance }: { instance?: unknown; tagName: string }) => {
			return instance ? this.radiantSsrPolicy.renderIntrinsicElementMarkup(instance) : undefined;
		};
	}

	/**
	 * Records the source files that produced the current render so
	 * {@link EcopagesJsxHmrStrategy} can match later watcher events without
	 * re-walking the component tree.
	 */
	private recordHmrOwnership(components: ReadonlyArray<EcoComponent | undefined>): void {
		this.renderSession.mergeHmrOwnership(components);
	}
}
