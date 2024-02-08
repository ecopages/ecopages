import type { MetadataProps } from "@/includes/seo.kita";
import type { RenderRouteOptions, EcoComponent, RenderRouteConfig } from "root/lib/eco-pages.types";
import { getHtmlPath } from "../build-html-pages.plugin";
import path from "node:path";

export async function createKitaRoute({
  file,
  config,
}: RenderRouteOptions): Promise<RenderRouteConfig> {
  const pagesDir = path.join(config.srcDir, config.pagesDir);

  const regex = new RegExp(
    `${config.srcDir}/(${config.componentsDir}|${config.layoutsDir}|${config.pagesDir}|${config.includesDir}|${config.globalDir})|\\.kita`
  );

  Object.keys(require.cache).forEach((key) => {
    if (regex.test(key)) {
      delete require.cache[key];
    }
  });

  const { HtmlTemplate } = await import("@/includes/html-template.kita");

  const { default: Page, metadata } = (await import(file)) as {
    default: EcoComponent;
    metadata: MetadataProps;
  };

  return {
    path: getHtmlPath({ file, pagesDir }),
    html: HtmlTemplate({ metadata, dependencies: Page.dependencies, children: Page({}) }),
  };
}
