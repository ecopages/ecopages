import { IntegrationRenderer, type IntegrationRendererRenderOptions, type RouteRendererBody } from '@eco-pages/core';
import { PLUGIN_NAME } from './kitajs.plugin';

export class KitaRenderer extends IntegrationRenderer {
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
        headContent: await this.getHeadContent(Page.dependencies),
        children: await Page({ params, query, ...props }),
      });

      return this.DOC_TYPE + body;
    } catch (error) {
      throw new Error(`[eco-pages] Error rendering page: ${error}`);
    }
  }
}
