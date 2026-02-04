/**
 * This module contains the ghtml renderer
 * @module
 */

import type {
	EcoComponent,
	EcoPagesElement,
	IntegrationRendererRenderOptions,
	PageMetadataProps,
	RouteRendererBody,
} from '../../public-types.ts';
import { IntegrationRenderer, type RenderToResponseContext } from '../../route-renderer/integration-renderer.ts';
import { GHTML_PLUGIN_NAME } from './ghtml.plugin.ts';

/**
 * A renderer for the ghtml integration.
 * It renders a page using the HtmlTemplate and Page components.
 */
export class GhtmlRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = GHTML_PLUGIN_NAME;

	async render({
		params,
		query,
		props,
		metadata,
		Page,
		HtmlTemplate,
	}: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
		try {
			const body = await HtmlTemplate({
				metadata,
				children: await Page({ params, query, ...props }),
				pageProps: props || {},
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
				| ((props: { children: EcoPagesElement } & Record<string, unknown>) => Promise<EcoPagesElement>)
				| undefined;

			const viewFn = view as (props: P) => Promise<EcoPagesElement>;
			const pageContent = await viewFn(props);

			let body: string;
			if (ctx.partial) {
				body = pageContent as string;
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

				body =
					this.DOC_TYPE +
					(await HtmlTemplate({
						metadata,
						children: children as EcoPagesElement,
						pageProps: props as Record<string, unknown>,
					}));
			}

			return this.createHtmlResponse(body, ctx);
		} catch (error) {
			throw this.createRenderError('Error rendering view', error);
		}
	}
}
