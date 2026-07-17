/**
 * This module contains the Lit renderer
 * @module
 */

import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoFunctionComponent,
	EcoPagesElement,
	IntegrationRendererRenderOptions,
	PageParams,
	RouteRenderResult,
	RouteRendererBody,
	RouteRendererOptions,
} from '@ecopages/core';
import type { ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import './dom-shim.ts';
import {
	IntegrationRenderer,
	type RenderToResponseContext,
} from '@ecopages/core/route-renderer/orchestration/integration-renderer';
import type {
	ForeignSubtreeExecutionOwningRenderer,
	QueuedForeignSubtreeResolutionContext,
} from '@ecopages/core/route-renderer/orchestration/foreign-child/foreign-subtree-execution.service';
import {
	getForeignSubtreeResolutionContextKey,
	resolveOwningIntegrationRenderer,
} from '@ecopages/core/route-renderer/orchestration/foreign-child/owning-renderer-resolution';
import { LitSsrLazyPreloader } from './lit-ssr-lazy-preloader.ts';
import type { LitStaticRenderSession } from './lit-static-render-session.ts';
import { LIT_PLUGIN_NAME } from './lit.constants.ts';
import {
	injectLitRenderedChildren,
	LIT_COMPONENT_CHILDREN_SLOT_MARKER,
	normalizeLitHtml,
	renderLitValueToString,
} from './utils/lit-html-rendering.ts';

export type LitRendererOptions = ConstructorParameters<typeof IntegrationRenderer>[0] & {
	/**
	 * Lazy session lookup owned by {@link LitPlugin}.
	 *
	 * @remarks
	 * Must not snapshot the session at construction time. Plugin `setup()` may
	 * assign the session after the renderer is created; `execute` activates the
	 * integration runtime then reads this accessor so worker dispatch still works.
	 */
	getRenderSession?: () => LitStaticRenderSession | undefined;
};

/**
 * A renderer for the Lit integration.
 */
export class LitRenderer extends IntegrationRenderer<EcoPagesElement> {
	override name = LIT_PLUGIN_NAME;
	private readonly getRenderSession?: () => LitStaticRenderSession | undefined;

	constructor(options: LitRendererOptions) {
		const { getRenderSession, ...rendererOptions } = options;
		super(rendererOptions);
		this.getRenderSession = getRenderSession;
	}

	/**
	 * Renders a Lit page route, preferring the plugin worker when available.
	 *
	 * @remarks
	 * Activates the integration runtime before reading {@link getRenderSession}
	 * so a renderer constructed before plugin setup still sees the session.
	 * When `options.locals` is present, rendering stays in-process: request locals
	 * are not structured-cloned across the worker boundary.
	 */
	public override async execute(options: RouteRendererOptions): Promise<RouteRenderResult> {
		await this.ensureIntegrationRuntimeActivated();
		const renderSession = this.getRenderSession?.();

		if (renderSession && options.locals === undefined) {
			const params: PageParams = options.params ?? {};
			const result = await renderSession.renderPageInWorker({
				filePath: options.file,
				params,
				query: options.query,
			});

			return {
				body: result.html,
				cacheStrategy: result.cacheStrategy,
			};
		}

		return super.execute(options);
	}

	private isFunctionComponent(
		component: EcoComponent,
	): component is EcoFunctionComponent<Record<string, unknown>, Promise<EcoPagesElement> | EcoPagesElement> {
		return typeof component === 'function';
	}

	private async resolveQueuedForeignSubtreeChildren(
		children: unknown,
		queuedResolutionsByToken: Map<string, QueuedForeignSubtreeResolutionContext['queuedResolutions'][number]>,
		resolveToken: (token: string) => Promise<string>,
	): Promise<string | unknown | undefined> {
		if (children === undefined) {
			return undefined;
		}

		if (typeof children !== 'string') {
			return children;
		}

		let renderedChildren = children;
		renderedChildren = await this.foreignSubtreeExecutionService.resolveQueuedTokens(
			renderedChildren,
			queuedResolutionsByToken,
			resolveToken,
		);

		return renderedChildren;
	}

	private async renderLitQueuedForeignSubtreeChildren(
		children: unknown,
		queuedResolutionsByToken: Map<string, QueuedForeignSubtreeResolutionContext['queuedResolutions'][number]>,
		resolveToken: (token: string) => Promise<string>,
	): Promise<{ assets: ProcessedAsset[]; children?: unknown; html?: string }> {
		const renderedChildren = await this.resolveQueuedForeignSubtreeChildren(
			children,
			queuedResolutionsByToken,
			resolveToken,
		);

		if (typeof renderedChildren !== 'string') {
			return {
				assets: [],
				children: renderedChildren,
			};
		}

		return {
			assets: [],
			html: renderedChildren,
		};
	}

	/**
	 * Renders a Lit component for component-level orchestration.
	 *
	 * SSR-eligible lazy scripts are preloaded first so custom elements registered
	 * by the component can render their server markup even when the Lit renderer is
	 * entered through cross-integration foreign-child handoff.
	 *
	 * Includes component-scoped dependency assets when declared.
	 */
	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		await this.preloadSsrLazyScripts([input.component]);

		if (!this.isFunctionComponent(input.component)) {
			throw new TypeError('Lit renderer expected a callable component.');
		}

		const component = input.component;
		let renderedChildren: string | undefined;
		if (input.children !== undefined) {
			renderedChildren =
				typeof input.children === 'string' ? input.children : await renderLitValueToString(input.children);
		}

		let props = input.props;
		if (renderedChildren !== undefined) {
			props = {
				...input.props,
				children: LIT_COMPONENT_CHILDREN_SLOT_MARKER,
			};
		}
		const content = await component(props);
		const renderedHtml = await renderLitValueToString(content);
		const html =
			renderedChildren === undefined ? renderedHtml : injectLitRenderedChildren(renderedHtml, renderedChildren);
		const queuedForeignSubtreeResolution = await this.foreignSubtreeExecutionService.resolveQueuedHtml({
			currentIntegrationName: this.name,
			html,
			runtimeContext:
				this.foreignSubtreeExecutionService.getQueuedRuntimeContext<QueuedForeignSubtreeResolutionContext>(
					input,
					getForeignSubtreeResolutionContextKey(this.name),
				),
			queueLabel: 'Lit',
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
			renderQueuedChildren: (children, _runtimeContext, queuedResolutionsByToken, resolveToken) =>
				this.renderLitQueuedForeignSubtreeChildren(children, queuedResolutionsByToken, resolveToken),
		});
		const hasDependencies = Boolean(input.component.config?.dependencies);
		const canResolveAssets = typeof this.assetProcessingService?.processDependencies === 'function';
		const assets =
			hasDependencies && canResolveAssets
				? await this.processComponentDependencies([input.component])
				: undefined;

		return {
			html: queuedForeignSubtreeResolution.html,
			canAttachAttributes: true,
			rootTag: this.getRootTagName(queuedForeignSubtreeResolution.html),
			integrationName: this.name,
			assets: this.htmlTransformer.dedupeProcessedAssets([
				...(assets ?? []),
				...queuedForeignSubtreeResolution.assets,
			]),
		};
	}

	private readonly ssrLazyPreloader = new LitSsrLazyPreloader({
		resolveDependencyPath: this.resolveDependencyPath.bind(this),
		processDependencies: this.assetProcessingService?.processDependencies?.bind(this.assetProcessingService),
	});

	/**
	 * Detects preload failures that are expected for browser-only modules.
	 *
	 * These errors are treated as non-fatal during SSR preload because some
	 * lazy client scripts intentionally depend on browser globals.
	 */
	protected isExpectedSsrPreloadError(error: unknown): boolean {
		return this.ssrLazyPreloader.isExpectedSsrPreloadError(error);
	}

	/**
	 * Collects lazy script file paths eligible for SSR preloading.
	 *
	 * Only per-entry lazy script dependencies with `ssr: true` are collected.
	 * File-backed entries are required (`src` must be present);
	 * inline content lazy entries are intentionally skipped.
	 */
	protected collectSsrPreloadScripts(components: Array<EcoComponent | undefined>): string[] {
		return this.ssrLazyPreloader.collectSsrPreloadScripts(components);
	}

	/**
	 * Preloads SSR-eligible lazy scripts to register custom elements before render.
	 */
	protected async preloadSsrLazyScripts(components: Array<EcoComponent | undefined>): Promise<void> {
		const renderSession = this.getRenderSession?.();
		if (renderSession) {
			await renderSession.preloadSsrLazyScripts(components);
			return;
		}

		await this.ssrLazyPreloader.preloadSsrLazyScripts(components);
	}

	/**
	 * Resolves the concrete JS entrypoint used for SSR preloading.
	 *
	 * Scripts are passed through the asset pipeline so preload imports can use
	 * the same processed output shape as runtime dependencies.
	 */
	protected async resolveSsrPreloadEntrypoint(scriptPath: string): Promise<string | null> {
		return this.ssrLazyPreloader.resolveSsrPreloadEntrypoint(scriptPath);
	}

	async render({
		params,
		query,
		props,
		locals,
		metadata,
		Page,
		Layout,
		HtmlTemplate,
	}: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
		try {
			await this.preloadSsrLazyScripts([Page, Layout]);

			return await this.renderPageWithDocumentShell({
				page: {
					component: Page,
					props: {
						params,
						query,
						...props,
						locals,
					},
				},
				layout: Layout
					? {
							component: Layout,
							props: locals ? { locals } : {},
						}
					: undefined,
				htmlTemplate: HtmlTemplate,
				metadata,
				pageProps: props || {},
				transformDocumentHtml: normalizeLitHtml,
			});
		} catch (error) {
			throw this.createRenderError('Error rendering page', error);
		}
	}

	async renderToResponse<P = Record<string, unknown>>(
		view: EcoComponent<P>,
		props: P,
		ctx: RenderToResponseContext,
	): Promise<Response> {
		try {
			const layouts = view.config?.layouts;
			const Layout = layouts?.[layouts.length - 1];
			await this.preloadSsrLazyScripts([view, Layout]);

			return await this.renderViewWithDocumentShell({
				view,
				props,
				ctx,
				layout: Layout,
				transformDocumentHtml: normalizeLitHtml,
			});
		} catch (error) {
			throw this.createRenderError('Error rendering view', error);
		}
	}
}
