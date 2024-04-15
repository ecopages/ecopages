import type { EcoPageFile } from '@/eco-pages';
import { render } from '@lit-labs/ssr';
import { RenderResultReadable } from '@lit-labs/ssr/lib/render-result-readable';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { RouteRendererBody } from '../route-renderer';
import { AbstractRenderer } from './abstract-renderer';

export class LitRenderer extends AbstractRenderer {
  async render(): Promise<RouteRendererBody> {
    const { file } = this.options;

    const HtmlTemplate = await this.getHtmlTemplate();

    const { default: Page, getStaticProps, getMetadata } = (await import(file)) as EcoPageFile;

    const { params, query } = this.options;

    try {
      const props = await this.getProps(getStaticProps);

      const metadata = await this.getMetadataProps(getMetadata, props);

      const children = await Page({ params, query, ...props });

      const template = await HtmlTemplate({
        metadata,
        dependencies: Page.dependencies,
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
