import { IntegrationRenderer, type IntegrationRendererRenderOptions } from '@/route-renderer/integration-renderer';
import type { RouteRendererBody } from '@/route-renderer/route-renderer';
import { render } from '@lit-labs/ssr';
import { RenderResultReadable } from '@lit-labs/ssr/lib/render-result-readable';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { litPlugin } from './lit.plugin';

export class LitRenderer extends IntegrationRenderer {
  name = litPlugin.name;
  extensions = litPlugin.extensions;

  async render({
    params,
    query,
    props,
    metadata,
    Page,
    HtmlTemplate,
  }: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
    try {
      const children = await Page({ params, query, ...props });

      const template = await HtmlTemplate({
        metadata,
        headContent: await this.getHeadContent(Page.dependencies),
        children: '<--content-->',
      });

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
      throw new Error(`[eco-pages] Error rendering page: ${error}`);
    }
  }
}
