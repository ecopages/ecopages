import { IntegrationRenderer, type IntegrationRendererRenderOptions } from '@/route-renderer/integration-renderer';
import type { RouteRendererBody } from '@/route-renderer/route-renderer';
import { kitaPlugin } from './kita.plugin';

export class KitaRenderer extends IntegrationRenderer {
  name = kitaPlugin.name;
  extensions = kitaPlugin.extensions;

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
