/**
 * This module contains the Lit renderer
 * @module
 */

import {
	type EcoPagesElement,
	IntegrationRenderer,
	type IntegrationRendererRenderOptions,
	type RouteRendererBody,
} from '@ecopages/core';
import { render } from '@lit-labs/ssr';
import { RenderResultReadable } from '@lit-labs/ssr/lib/render-result-readable.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { PLUGIN_NAME } from './lit.plugin.js';

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
			throw new Error(`[ecopages] Error rendering page: ${error}`);
		}
	}
}
