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
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import { render } from '@lit-labs/ssr';
import { RenderResultReadable } from '@lit-labs/ssr/lib/render-result-readable.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { LitSsrLazyPreloader } from './lit-ssr-lazy-preloader.ts';
import { PLUGIN_NAME } from './lit.plugin.ts';

/**
 * A renderer for the Lit integration.
 */
export class LitRenderer extends IntegrationRenderer<EcoPagesElement> {
	override name = PLUGIN_NAME;

	/**
	 * Renders a Lit component boundary for component-level orchestration.
	 *
	 * Includes component-scoped dependency assets when declared.
	 */
	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		const component = input.component as (
			props: Record<string, unknown>,
		) => Promise<EcoPagesElement> | EcoPagesElement;
		const props = input.children === undefined ? input.props : { ...input.props, children: input.children };
		const content = await component(props);
		const html = String(content);
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

			const pageContent = await Page({ params, query, ...props, locals });
			const children = Layout
				? await (Layout as (props: { children: EcoPagesElement } & Record<string, unknown>) => EcoPagesElement)(
						{
							children: pageContent,
							locals,
						},
					)
				: pageContent;

			const template = (await HtmlTemplate({
				metadata,
				children: '<--content-->',
				pageProps: props || {},
			})) as string;

			const [templateStart, templateEnd] = template.split('<--content-->');

			const DOC_TYPE = this.DOC_TYPE;

			function* streamBody() {
				yield DOC_TYPE;
				yield templateStart;
				yield* render(unsafeHTML(children));
				yield templateEnd;
			}

			return new RenderResultReadable(streamBody());
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
			const viewConfig = view.config;
			const Layout = viewConfig?.layout as
				| ((props: { children: EcoPagesElement } & Record<string, unknown>) => EcoPagesElement)
				| undefined;

			await this.preloadSsrLazyScripts([
				view as unknown as EcoComponent,
				Layout as unknown as EcoComponent,
			]);

			const viewFn = view as (props: P) => Promise<EcoPagesElement>;
			const pageContent = await viewFn(props);

			if (ctx.partial) {
				function* streamBody() {
					yield* render(unsafeHTML(pageContent));
				}
				const readable = new RenderResultReadable(streamBody());
				return this.createHtmlResponse(readable as unknown as BodyInit, ctx);
			}

			const DOC_TYPE = this.DOC_TYPE;
			const children = Layout ? await Layout({ children: pageContent }) : pageContent;

			const HtmlTemplate = await this.getHtmlTemplate();
			const metadata: PageMetadataProps = view.metadata
				? await view.metadata({
						params: {},
						query: {},
						props: props as Record<string, unknown>,
						appConfig: this.appConfig,
					})
				: this.appConfig.defaultMetadata;

			await this.prepareViewDependencies(view, Layout as EcoComponent | undefined);

			const template = (await HtmlTemplate({
				metadata,
				children: '<--content-->',
				pageProps: props as Record<string, unknown>,
			})) as string;

			const [templateStart, templateEnd] = template.split('<--content-->');

			function* streamBody() {
				yield DOC_TYPE;
				yield templateStart;
				yield* render(unsafeHTML(children));
				yield templateEnd;
			}
			const stream = new RenderResultReadable(streamBody());
			const transformedResponse = await this.htmlTransformer.transform(
				new Response(stream as any, {
					headers: { 'Content-Type': 'text/html' },
				}),
			);

			return this.createHtmlResponse(transformedResponse.body as BodyInit, ctx);
		} catch (error) {
			throw this.createRenderError('Error rendering view', error);
		}
	}
}
