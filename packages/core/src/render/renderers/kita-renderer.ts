import type { RouteRendererBody } from "../route-renderer";
import type { EcoPage, EcoPageFile, GetMetadata, GetStaticProps } from "@/eco-pages";
import { AbstractRenderer } from "./abstract-renderer";

export class KitaRenderer extends AbstractRenderer {
  private async renderStatic({
    HtmlTemplate,
    Page,
    getMetadata,
    getStaticProps,
  }: {
    HtmlTemplate: any;
    Page: EcoPage;
    getMetadata?: GetMetadata;
    getStaticProps?: GetStaticProps<unknown>;
  }): Promise<RouteRendererBody> {
    const { params, query } = this.options;

    try {
      const props = await this.getProps(getStaticProps);

      const metadata = await this.getMetadataProps(getMetadata, props);

      return (
        this.DOC_TYPE +
        (await HtmlTemplate({
          metadata,
          dependencies: Page.dependencies,
          headContent: await this.getHeadContent(Page.dependencies),
          children: await Page({ params, query, ...props }),
        }))
      );
    } catch (error) {
      throw new Error(`[eco-pages] Error rendering static page: ${error}`);
    }
  }

  async renderSSR({
    HtmlTemplate,
    Page,
    getMetadata,
  }: {
    HtmlTemplate: any;
    Page: EcoPage;
    getMetadata?: GetMetadata;
  }): Promise<RouteRendererBody> {
    const { params, query } = this.options;

    const metadata = await this.getMetadataProps(getMetadata);

    const children = await Page({ params, query });

    const headContent = await this.getHeadContent(Page.dependencies);

    return (
      this.DOC_TYPE +
      (await HtmlTemplate({
        metadata,
        dependencies: Page.dependencies,
        headContent,
        children,
      }))
    );
  }

  async render() {
    const { file } = this.options;

    const HtmlTemplate = await this.getHtmlTemplate();

    const { default: Page, getStaticProps, getMetadata } = (await import(file)) as EcoPageFile;

    const pageRenderStrategy = Page.renderStrategy || "static";

    switch (pageRenderStrategy) {
      case "static":
      case "isg":
        return await this.renderStatic({ HtmlTemplate, Page, getMetadata, getStaticProps });
      case "ssr":
        return await this.renderSSR({ HtmlTemplate, Page, getMetadata });
      default:
        throw new Error(`[eco-pages] Invalid render strategy: ${pageRenderStrategy}`);
    }
  }
}
