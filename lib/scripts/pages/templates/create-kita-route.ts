import path from "node:path";
import type { MetadataProps } from "@/includes/seo.kita";
import type { RenderRouteOptions, EcoComponent, RenderRouteConfig } from "root/lib/eco-pages.types";
import { getHtmlPath } from "../build-html-pages.plugin";
import { uncacheModules } from "../utils/uncache-modules";

export async function createKitaRoute({
  file,
  config,
}: RenderRouteOptions): Promise<RenderRouteConfig> {
  const pagesDir = path.join(config.srcDir, config.pagesDir);

  uncacheModules(config);

  const { HtmlTemplate } = await import("@/includes/html-template.kita");

  const { default: Page, metadata } = (await import(file)) as {
    default: EcoComponent;
    metadata: MetadataProps;
  };

  const children = await Page({});

  return {
    path: getHtmlPath({ file, pagesDir }),
    html: HtmlTemplate({ metadata, dependencies: Page.dependencies, children }),
  };
}
