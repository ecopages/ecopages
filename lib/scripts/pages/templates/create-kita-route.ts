import type { MetadataProps } from "@/includes/seo.kita";
import type { RenderRouteOptions, EcoComponent, RenderRouteConfig } from "root/lib/eco-pages.types";
import { HtmlTemplate } from "@/includes/html-template.kita";
import { getHtmlPath } from "root/lib/scripts/pages/utils/get-html-path";

export async function createKitaRoute({
  file,
  pagesDir,
}: RenderRouteOptions): Promise<RenderRouteConfig> {
  const { default: Page, metadata } = (await import(file)) as {
    default: EcoComponent;
    metadata: MetadataProps;
  };

  return {
    path: getHtmlPath({ file, pagesDir }),
    html: HtmlTemplate({ metadata, dependencies: Page.dependencies, children: Page({}) }),
  };
}
