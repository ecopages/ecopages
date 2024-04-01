import path from "path";
import { getHtmlPath } from "@/plugins/build-html-pages/build-html-pages.plugin";
import { HeadContentBuilder } from "@/render/utils/head-content-builder";
import { uncacheModules } from "@/render/utils/uncache-modules";
import type { IRouteRenderer, RouteRendererConfig, RouteRendererOptions } from "../route-renderer";
import type {
  EcoComponentDependencies,
  EcoPage,
  EcoPageFile,
  GetMetadata,
  GetStaticProps,
} from "@/eco-pages";

export class KitaRenderer implements IRouteRenderer {
  private declare options: Required<RouteRendererOptions>;

  get pagesDir() {
    return globalThis.ecoConfig.derivedPaths.pagesDir;
  }

  private async getHtmlTemplate() {
    const { derivedPaths } = globalThis.ecoConfig;
    const { default: HtmlTemplate } = await import(derivedPaths.htmlTemplatePath);
    return HtmlTemplate;
  }

  private async getHeadContent(dependencies?: EcoComponentDependencies) {
    const headContent = await new HeadContentBuilder().build({
      dependencies: dependencies,
    });
    return headContent;
  }

  private async getProps(getStaticProps?: GetStaticProps<unknown>) {
    return getStaticProps
      ? await getStaticProps({
          pathname: { params: this.options.params },
        }).then((data) => data.props as Record<string, unknown>)
      : {};
  }

  private async getMetadataProps(
    getMetadata: GetMetadata | undefined,
    props: Record<string, unknown> = {}
  ) {
    const { params, query } = this.options;
    return getMetadata ? await getMetadata({ params, query, ...props }) : undefined;
  }

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
  }): Promise<RouteRendererConfig> {
    const { file, params, query } = this.options;

    try {
      const props = await this.getProps(getStaticProps);

      const metadata = await this.getMetadataProps(getMetadata, props);

      return {
        path: getHtmlPath({ file, pagesDir: this.pagesDir }),
        html: await HtmlTemplate({
          metadata,
          dependencies: Page.dependencies,
          headContent: await this.getHeadContent(Page.dependencies),
          children: await Page({ params, query, ...props }),
        }),
      };
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
  }): Promise<RouteRendererConfig> {
    const { file, params, query } = this.options;

    const metadata = await this.getMetadataProps(getMetadata);

    const children = await Page({ params, query });

    const headContent = await this.getHeadContent(Page.dependencies);

    return {
      path: getHtmlPath({ file, pagesDir: this.pagesDir }),
      html: await HtmlTemplate({
        metadata,
        dependencies: Page.dependencies,
        headContent,
        children,
      }),
    };
  }

  async render(options: RouteRendererOptions): Promise<RouteRendererConfig> {
    this.options = { ...options, params: options.params || {}, query: options.query || {} };
    const { file } = this.options;

    uncacheModules();

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
