/**
 * This module contains the Kita.js renderer
 * @module
 */

import type {
	EcoComponent,
	EcoPagesElement,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
} from '@ecopages/core';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import { PLUGIN_NAME } from './kitajs.plugin.ts';

/**
 * A renderer for the Kita.js integration.
 * It renders a page using the HtmlTemplate and Page components.
 */
export class KitaRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = PLUGIN_NAME;

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
			const children =
				Layout && typeof Layout === 'function' ? await Layout({ children: pageContent }) : pageContent;
			const body = await HtmlTemplate({
				metadata,
				pageProps: props ?? {},
				children,
			});

			return this.DOC_TYPE + body;
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
			const Layout = view.config?.layout as
				| ((props: { children: EcoPagesElement }) => Promise<EcoPagesElement>)
				| undefined;

			const viewFn = view as (props: P) => Promise<EcoPagesElement>;
			const pageContent = await viewFn(props);

			let body: string;
			if (ctx.partial) {
				body = pageContent as string;
			} else {
				const children = Layout ? await Layout({ children: pageContent }) : pageContent;

				const HtmlTemplate = await this.getHtmlTemplate();
				const metadata = view.metadata
					? await view.metadata({
							params: {},
							query: {},
							props: props as Record<string, unknown>,
							appConfig: this.appConfig,
						})
					: this.appConfig.defaultMetadata;

				body =
					this.DOC_TYPE +
					(await HtmlTemplate({
						metadata,
						pageProps: props as Record<string, unknown>,
						children: children as EcoPagesElement,
					}));
			}

			return this.createHtmlResponse(body, ctx);
		} catch (error) {
			throw this.createRenderError('Error rendering view', error);
		}
	}
}
