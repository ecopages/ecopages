import type { EcoPageFile } from '@/eco-pages';
import { IntegrationRenderer } from '../../route-renderer/integration-renderer';

export class KitaRenderer extends IntegrationRenderer {
  override async render() {
    const { file } = this.options;

    const HtmlTemplate = await this.getHtmlTemplate();

    const { default: Page, getStaticProps, getMetadata } = (await import(file)) as EcoPageFile;

    const { params, query } = this.options;

    try {
      const props = await this.getProps(getStaticProps);

      const metadata = await this.getMetadataProps(getMetadata, props);

      const body = await HtmlTemplate({
        metadata,
        dependencies: Page.dependencies,
        headContent: await this.getHeadContent(Page.dependencies),
        children: await Page({ params, query, ...props }),
      });

      return this.DOC_TYPE + body;
    } catch (error) {
      throw new Error(`[eco-pages] Error rendering page: ${error}`);
    }
  }
}
