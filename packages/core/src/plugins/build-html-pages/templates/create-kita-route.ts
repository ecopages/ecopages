import path from "node:path";
import type {
  RenderRouteOptions,
  EcoComponent,
  RenderRouteConfig,
  PageMetadataProps,
  EcoPageFile,
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

  const { default: Page, metadata, getStaticProps } = (await import(file)) as EcoPageFile;

  if (["static", "isg"].includes(Page.renderStrategy || "static") && getStaticProps && params) {
    try {
      const data = (await getStaticProps({
        pathname: { params: params as Record<string, string> },
      })) as { props: Record<string, unknown>; metadata: PageMetadataProps };

      return {
        path: getHtmlPath({ file, pagesDir }),
        html: await HtmlTemplate({
          metadata,
          dependencies: Page.dependencies,
          headContent: await new HeadContentBuilder(config).build({
            dependencies: Page.dependencies,
          }),
          children: await Page({ params, query, ...data.props }),
        }),
      };
    } catch (error) {
      console.error(`[eco-pages] Error in getStaticProps for ${file}`);
      console.error(error);
    }
  }

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
