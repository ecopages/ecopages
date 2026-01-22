/**
 * This module contains the Lit renderer
 * @module
 */

import type {
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
import { PLUGIN_NAME } from './lit.plugin.ts';

/**
 * A renderer for the Lit integration.
 */
export class LitRenderer extends IntegrationRenderer<EcoPagesElement> {
	override name = PLUGIN_NAME;

	async render({
		params,
		query,
		props,
		metadata,
		Page,
		Layout,
		HtmlTemplate,
	}: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
		try {
			const pageContent = await Page({ params, query, ...props });
			const children = Layout
				? await (Layout as (props: { children: EcoPagesElement }) => EcoPagesElement)({ children: pageContent })
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
				| ((props: { children: EcoPagesElement }) => EcoPagesElement)
				| undefined;

			const viewFn = view as (props: P) => Promise<EcoPagesElement>;
			const pageContent = await viewFn(props);

			const DOC_TYPE = this.DOC_TYPE;
			let readable: RenderResultReadable;

			if (ctx.partial) {
				function* streamBody() {
					yield* render(unsafeHTML(pageContent));
				}
				readable = new RenderResultReadable(streamBody());
			} else {
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
				readable = new RenderResultReadable(streamBody());
			}

			return this.createHtmlResponse(readable as unknown as BodyInit, ctx);
		} catch (error) {
			throw this.createRenderError('Error rendering view', error);
		}
	}
}
