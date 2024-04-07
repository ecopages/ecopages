import type { RouteRendererBody } from "../route-renderer";
import type { EcoPage, EcoPageFile, GetMetadata, GetStaticProps } from "@/eco-pages";
import { render } from "@lit-labs/ssr";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { AbstractRenderer } from "./abstract-renderer";
import { RenderResultReadable } from "@lit-labs/ssr/lib/render-result-readable";

export class LitRenderer extends AbstractRenderer {
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

      const children = await Page({ params, query, ...props });

      const template = await HtmlTemplate({
        metadata,
        dependencies: Page.dependencies,
        headContent: await this.getHeadContent(Page.dependencies),
        children: "<--content-->",
      });

      const [templateStart, templateEnd] = template.split("<--content-->");

      function* streamBody() {
        yield "<!DOCTYPE html>";
        yield templateStart;
        yield* render(unsafeHTML(children));
        yield templateEnd;
      }

      return new RenderResultReadable(streamBody());
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

    try {
      const metadata = await this.getMetadataProps(getMetadata);

      const children = await Page({ params, query });

      const template = await HtmlTemplate({
        metadata,
        dependencies: Page.dependencies,
        headContent: await this.getHeadContent(Page.dependencies),
        children: "<--content-->",
      });

      const [templateStart, templateEnd] = template.split("<--content-->");

      function* streamBody() {
        yield "<!DOCTYPE html>";
        yield templateStart;
        yield* render(unsafeHTML(children));
        yield templateEnd;
      }

      return new RenderResultReadable(streamBody());
    } catch (error) {
      throw new Error(`[eco-pages] Error rendering ssr page: ${error}`);
    }
  }

  async render(): Promise<RouteRendererBody> {
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
