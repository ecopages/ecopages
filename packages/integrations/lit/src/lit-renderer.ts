/**
 * This module contains the Lit renderer
 * @module
 */

import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoPagesElement,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
} from '@ecopages/core';
import '@lit-labs/ssr/lib/install-global-dom-shim.js';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import { LitSsrLazyPreloader } from './lit-ssr-lazy-preloader.ts';
import { PLUGIN_NAME } from './lit.plugin.ts';
import {
	injectLitRenderedChildren,
	LIT_COMPONENT_CHILDREN_SLOT_MARKER,
	normalizeLitHtml,
	renderLitValueToString,
} from './utils/lit-html-rendering.ts';

type LitBoundaryRuntimeContext = {
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

/**
 * A renderer for the Lit integration.
 */
export class LitRenderer extends IntegrationRenderer<EcoPagesElement> {
	override name = PLUGIN_NAME;

	private async resolveQueuedBoundaryChildren(
		children: unknown,
		queuedResolutionsByToken: Map<string, LitBoundaryRuntimeContext['queuedResolutions'][number]>,
		resolveToken: (token: string) => Promise<string>,
	): Promise<string | undefined> {
		if (children === undefined) {
			return undefined;
		}

		let renderedChildren = typeof children === 'string' ? children : await renderLitValueToString(children);
		renderedChildren = await this.resolveQueuedBoundaryTokens(
			renderedChildren,
			queuedResolutionsByToken,
			resolveToken,
		);

		return renderedChildren;
	}

	private async resolveQueuedBoundaryHtml(
		html: string,
		runtimeContext: LitBoundaryRuntimeContext | undefined,
	): Promise<{ html: string; assets: ComponentRenderResult['assets'] }> {
		const queuedBoundaryResolution = await this.resolveRendererOwnedQueuedBoundaryHtml({
			html,
			runtimeContext,
			queueLabel: 'Lit',
			renderQueuedChildren: async (children, _runtimeContext, queuedResolutionsByToken, resolveToken) => {
				const renderedChildren = await this.resolveQueuedBoundaryChildren(
					children,
					queuedResolutionsByToken,
					resolveToken,
				);

				return {
					assets: [],
					html: renderedChildren,
				};
			},
		});

		return {
			html: queuedBoundaryResolution.html,
			assets: queuedBoundaryResolution.assets.length > 0 ? queuedBoundaryResolution.assets : undefined,
		};
	}

	protected override shouldRenderPageComponent(): boolean {
		return false;
	}

	private isLitManagedComponent(component: EcoComponent | undefined): boolean {
		return component?.config?.integration === this.name || component?.config?.__eco?.integration === this.name;
	}

	/**
	 * Renders a Lit component boundary for component-level orchestration.
	 *
	 * SSR-eligible lazy scripts are preloaded first so custom elements registered
	 * by the component can render their server markup even when the Lit renderer is
	 * entered through cross-integration boundary handoff.
	 *
	 * Includes component-scoped dependency assets when declared.
	 */
	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		await this.preloadSsrLazyScripts([input.component]);

		const component = input.component as (
			props: Record<string, unknown>,
		) => Promise<EcoPagesElement> | EcoPagesElement;
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
		const queuedBoundaryResolution = await this.resolveQueuedBoundaryHtml(
			html,
			this.getQueuedBoundaryRuntime<LitBoundaryRuntimeContext>(input),
		);
		const hasDependencies = Boolean(input.component.config?.dependencies);
		const canResolveAssets = typeof this.assetProcessingService?.processDependencies === 'function';
		const assets =
			hasDependencies && canResolveAssets
				? await this.processComponentDependencies([input.component])
				: undefined;

		return {
			html: queuedBoundaryResolution.html,
			canAttachAttributes: true,
			rootTag: this.getRootTagName(queuedBoundaryResolution.html),
			integrationName: this.name,
			assets: this.htmlTransformer.dedupeProcessedAssets([
				...(assets ?? []),
				...(queuedBoundaryResolution.assets ?? []),
			]),
		};
	}

	protected override createComponentBoundaryRuntime(options: {
		boundaryInput: ComponentRenderInput;
		rendererCache: Map<string, IntegrationRenderer<any>>;
	}) {
		return this.createQueuedBoundaryRuntime<LitBoundaryRuntimeContext>({
			boundaryInput: options.boundaryInput,
			rendererCache: options.rendererCache,
		});
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
					component: Page as EcoComponent,
					props: {
						params,
						query,
						...props,
						locals,
					},
				},
				layout: Layout
					? {
							component: Layout as EcoComponent,
							props: locals ? { locals } : {},
						}
					: undefined,
				htmlTemplate: HtmlTemplate as EcoComponent,
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
			if (ctx.partial) {
				return this.renderPartialViewResponse({
					view,
					props,
					ctx,
					transformHtml: normalizeLitHtml,
				});
			}

			const viewConfig = view.config;
			const Layout = viewConfig?.layout as
				| ((props: { children: EcoPagesElement } & Record<string, unknown>) => EcoPagesElement)
				| undefined;
			const HtmlTemplate = await this.getHtmlTemplate();
			const metadata = await this.resolveViewMetadata(view, props);

			await this.preloadSsrLazyScripts([view as unknown as EcoComponent, Layout as unknown as EcoComponent]);

			await this.prepareViewDependencies(view, Layout as EcoComponent | undefined);

			const pageRender = await this.renderComponentBoundary({
				component: view as EcoComponent,
				props: (props ?? {}) as Record<string, unknown>,
			});
			const layoutRender = Layout
				? await this.renderComponentBoundary({
						component: Layout as unknown as EcoComponent,
						props: {},
						children: pageRender.html,
					})
				: undefined;
			const documentRender = await this.renderComponentBoundary({
				component: HtmlTemplate as EcoComponent,
				props: {
					metadata,
					pageProps: (props as Record<string, unknown>) ?? {},
				},
				children: layoutRender?.html ?? pageRender.html,
			});

			this.appendProcessedDependencies(pageRender.assets, layoutRender?.assets, documentRender.assets);

			const body = await this.finalizeResolvedHtml({
				html: `${this.DOC_TYPE}${normalizeLitHtml(documentRender.html)}`,
				partial: false,
			});

			return this.createHtmlResponse(body, ctx);
		} catch (error) {
			throw this.createRenderError('Error rendering view', error);
		}
	}
}
