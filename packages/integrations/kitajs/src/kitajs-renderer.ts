/**
 * This module contains the Kita.js renderer
 * @module
 */

import {
  type EcoPagesElement,
  IntegrationRenderer,
  type IntegrationRendererRenderOptions,
  type RouteRendererBody,
} from '@ecopages/core';
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
    HtmlTemplate,
  }: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
    try {
      const body = await HtmlTemplate({
        metadata,
        children: await Page({ params, query, ...props }),
      });

      return this.DOC_TYPE + body;
    } catch (error) {
      throw new Error(`[ecopages] Error rendering page: ${error}`);
    }
  }
}
