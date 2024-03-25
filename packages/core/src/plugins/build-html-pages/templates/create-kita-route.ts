import path from "node:path";
import type { PageMetadataProps, EcoPageFile } from "@types";
import { getHtmlPath } from "../build-html-pages.plugin";
import { uncacheModules } from "../utils/uncache-modules";
import { HeadContentBuilder } from "../utils/head-content-builder";
import type { RouteRendererOptions, RouteRendererConfig } from "@/render/route-renderer";

/**
 * @deprecated
 * This function creates a route config based on the file and the eco config.
 * It handles kita files and provides the html and the route data.
 * @param file
 * @param config
 */
export async function createKitaRoute({
  file,
  params = {},
  query = {},
}: RouteRendererOptions): Promise<RouteRendererConfig> {
  const { rootDir, srcDir, pagesDir } = globalThis.ecoConfig;

  const projectSrcDir = path.join(rootDir, srcDir);
  const projectPagesDir = path.join(projectSrcDir, pagesDir);

  uncacheModules();

  const { HtmlTemplate } = await import(`${projectSrcDir}/includes/html-template.kita`);

  const { default: Page, getStaticProps, getMetadata } = (await import(file)) as EcoPageFile;

  let metadata: PageMetadataProps | undefined;

  if (["static", "isg"].includes(Page.renderStrategy || "static") && getStaticProps && params) {
    try {
      const data = (await getStaticProps({
        pathname: { params: params as Record<string, string> },
      })) as { props: Record<string, unknown> };

      metadata = (await getMetadata?.({ params, query: query || {}, ...data.props })) || undefined;

      return {
        path: getHtmlPath({ file, pagesDir: projectPagesDir }),
        html: await HtmlTemplate({
          metadata,
          dependencies: Page.dependencies,
          headContent: await new HeadContentBuilder().build({
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

  metadata = (await getMetadata?.({ params, query })) || undefined;

  const children = await Page({ params, query });

  const headContent = await new HeadContentBuilder().build({
    dependencies: Page.dependencies,
  });

  return {
    path: getHtmlPath({ file, pagesDir: projectPagesDir }),
    html: await HtmlTemplate({
      metadata,
      dependencies: Page.dependencies,
      headContent,
      children,
    }),
  };
}
