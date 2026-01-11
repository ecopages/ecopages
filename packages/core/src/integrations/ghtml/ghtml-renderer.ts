/**
 * This module contains the ghtml renderer
 * @module
 */

import type { EcoPagesElement, IntegrationRendererRenderOptions, RouteRendererBody } from '../../public-types.ts';
import { IntegrationRenderer } from '../../route-renderer/integration-renderer.ts';
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
			throw new Error(`[ecopages] Error rendering page: ${error}`);
		}
	}
}
