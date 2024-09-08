/**
 * This module contains the ghtml renderer
 * @module
 */

import { IntegrationRenderer, type IntegrationRendererRenderOptions, type RouteRendererBody } from '@ecopages/core';
import { PLUGIN_NAME } from './ghtml.plugin.ts';

/**
 * A renderer for the ghtml integration.
 * It renders a page using the HtmlTemplate and Page components.
 */
export class GhtmlRenderer extends IntegrationRenderer {
  name = PLUGIN_NAME;

  async render({
    params,
    query,
    props,
    metadata,
    dependencies,
    Page,
    HtmlTemplate,
  }: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
    try {
      const body = await HtmlTemplate({
        metadata,
        headContent: await this.getHeadContent(dependencies),
        children: await Page({ params, query, ...props }),
      });

      return this.DOC_TYPE + body;
    } catch (error) {
      throw new Error(`[ecopages] Error rendering page: ${error}`);
    }
  }
}
