import path from "node:path";
import type {
  RenderRouteOptions,
  EcoComponent,
  RenderRouteConfig,
  PageMetadataProps,
} from "@types";
import { getHtmlPath } from "../build-html-pages.plugin";
import { uncacheModules } from "../utils/uncache-modules";
import { HeadContentBuilder } from "../utils/head-content-builder";

/**
 * This function creates a route config based on the file and the eco config.
 * It handles kita files and provides the html and the route data.
 * @param file
 * @param config
 */
export async function createKitaRoute({
  file,
  config,
  params,
  query,
}: RenderRouteOptions): Promise<RenderRouteConfig> {
  const projectSrcDir = path.join(config.rootDir, config.srcDir);
  const pagesDir = path.join(projectSrcDir, config.pagesDir);

  uncacheModules(config);

  const { HtmlTemplate } = await import(`${projectSrcDir}/includes/html-template.kita`);

  const { default: Page, metadata } = (await import(file)) as {
    default: EcoComponent;
    metadata: PageMetadataProps;
  };

  const children = await Page({ params, query });

  const headContent = await new HeadContentBuilder(config).build({
    dependencies: Page.dependencies,
  });

  return {
    path: getHtmlPath({ file, pagesDir }),
    html: await HtmlTemplate({
      metadata,
      dependencies: Page.dependencies,
      headContent,
      children,
    }),
  };
}
