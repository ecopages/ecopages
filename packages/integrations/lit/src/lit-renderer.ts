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
	PageMetadataProps,
	RouteRendererBody,
} from '@ecopages/core';
import '@lit-labs/ssr/lib/install-global-dom-shim.js';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import { render } from '@lit-labs/ssr';
import { html as staticHtml, unsafeStatic } from 'lit/static-html.js';
import { LitSsrLazyPreloader } from './lit-ssr-lazy-preloader.ts';
import { PLUGIN_NAME } from './lit.plugin.ts';

const HTML_TEMPLATE_SLOT_MARKER = '<--content-->';
const COMPONENT_CHILDREN_SLOT_MARKER = '<!--eco-lit-component-children-->';
const ESCAPED_COMPONENT_CHILDREN_SLOT_MARKER = '&lt;!--eco-lit-component-children--&gt;';
const DOUBLE_ESCAPED_COMPONENT_CHILDREN_SLOT_MARKER = '&amp;lt;!--eco-lit-component-children--&amp;gt;';
const DUPLICATE_DECLARATIVE_SHADOW_ROOT_ATTRIBUTE = /\sshadowroot=(['"])(open|closed)\1(?=\sshadowrootmode=\1\2\1)/g;

/**
 * A renderer for the Lit integration.
 */
export class LitRenderer extends IntegrationRenderer<EcoPagesElement> {
	override name = PLUGIN_NAME;

	private normalizeDeclarativeShadowRootMarkup(markup: string): string {
		return markup.replace(DUPLICATE_DECLARATIVE_SHADOW_ROOT_ATTRIBUTE, '');
	}

	private createRenderableMarkup(markup: string) {
		return staticHtml`${unsafeStatic(markup)}`;
	}

	protected override shouldRenderPageComponent(): boolean {
		return false;
	}

	private async renderMarkupToString(markup: string): Promise<string> {
		let renderedHtml = '';
		for (const chunk of render(this.createRenderableMarkup(markup))) {
			renderedHtml += chunk;
		}
		return this.normalizeDeclarativeShadowRootMarkup(renderedHtml);
	}

	private async renderValueToString(value: unknown): Promise<string> {
		if (typeof value === 'string') {
			return await this.renderMarkupToString(value);
		}

		let renderedHtml = '';
		for (const chunk of render(value as Parameters<typeof render>[0])) {
			renderedHtml += chunk;
		}
		return this.normalizeDeclarativeShadowRootMarkup(renderedHtml);
	}

	private isLitManagedComponent(component: EcoComponent | undefined): boolean {
		return component?.config?.integration === this.name || component?.config?.__eco?.integration === this.name;
	}

	private injectRenderedChildren(template: string, renderedChildren: string): string {
		for (const marker of [
			COMPONENT_CHILDREN_SLOT_MARKER,
			ESCAPED_COMPONENT_CHILDREN_SLOT_MARKER,
			DOUBLE_ESCAPED_COMPONENT_CHILDREN_SLOT_MARKER,
		]) {
			if (template.includes(marker)) {
				return template.split(marker).join(renderedChildren);
			}
		}

		if (template.includes(HTML_TEMPLATE_SLOT_MARKER)) {
			return template.split(HTML_TEMPLATE_SLOT_MARKER).join(renderedChildren);
		}

		if (template.includes('</body>')) {
			return template.replace('</body>', `${renderedChildren}</body>`);
		}

		if (template.includes('</html>')) {
			return template.replace('</html>', `${renderedChildren}</html>`);
		}

		return `${template}${renderedChildren}`;
	}

	private async renderHtmlTemplate(options: {
		HtmlTemplate: IntegrationRendererRenderOptions['HtmlTemplate'];
		metadata: PageMetadataProps;
		pageProps: Record<string, unknown>;
		renderedChildren: string;
		isLitManagedHtmlTemplate: boolean;
	}): Promise<string> {
		if (!options.isLitManagedHtmlTemplate) {
			return String(
				await options.HtmlTemplate({
					metadata: options.metadata,
					children: options.renderedChildren,
					pageProps: options.pageProps,
				}),
			);
		}

		const template = await options.HtmlTemplate({
			metadata: options.metadata,
			children: HTML_TEMPLATE_SLOT_MARKER,
			pageProps: options.pageProps,
		});

		return this.injectRenderedChildren(String(template), options.renderedChildren);
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
		const renderedChildren =
			input.children === undefined
				? undefined
				: typeof input.children === 'string'
					? input.children
					: await this.renderValueToString(input.children);
		const props =
			renderedChildren === undefined
				? input.props
				: {
						...input.props,
						children: COMPONENT_CHILDREN_SLOT_MARKER,
					};
		const content = await component(props);
		const renderedHtml = await this.renderValueToString(content);
		const html =
			renderedChildren === undefined ? renderedHtml : this.injectRenderedChildren(renderedHtml, renderedChildren);
		const hasDependencies = Boolean(input.component.config?.dependencies);
		const canResolveAssets = typeof this.assetProcessingService?.processDependencies === 'function';
		const assets =
			hasDependencies && canResolveAssets
				? await this.processComponentDependencies([input.component])
				: undefined;

		return {
			html,
			canAttachAttributes: true,
			rootTag: this.getRootTagName(html),
			integrationName: this.name,
			assets,
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
				transformDocumentHtml: (html) => this.normalizeDeclarativeShadowRootMarkup(html),
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
					transformHtml: (html) => this.normalizeDeclarativeShadowRootMarkup(html),
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
				html: `${this.DOC_TYPE}${this.normalizeDeclarativeShadowRootMarkup(documentRender.html)}`,
				partial: false,
			});

			return this.createHtmlResponse(body, ctx);
		} catch (error) {
			throw this.createRenderError('Error rendering view', error);
		}
	}
}
