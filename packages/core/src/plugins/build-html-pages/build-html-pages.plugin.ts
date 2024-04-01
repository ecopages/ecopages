import path from "node:path";
import type { BunPlugin } from "bun";
import { type DefaultTemplateEngines, type EcoPagesConfig } from "@types";
import { RouteRenderer, type RouteRendererConfig } from "@/render/route-renderer";
import { KitaRenderer } from "@/render/renderers/kita-rendererer";
import { PathUtils } from "@/utils/path-utils";
import { FileUtils } from "@/utils/file-utils";

/**
 * Get the html path based on the file and the pagesDir.
 * @param file
 * @param pagesDir
 * @returns
 */
export function getHtmlPath({ file, pagesDir }: { file: string; pagesDir: string }) {
  let startIndex = file.indexOf(pagesDir) + pagesDir.length;
  let endIndex = file.lastIndexOf("/");
  let path = file.substring(startIndex, endIndex);
  if (path === "/index") return "";
  return path;
}

/**
 * Create a route config based on the file and the eco config.
 * It will provide the html and the route data.
 * @param file
 * @param config
 * @returns {Promise<RouteRendererConfig>}
 */
export async function createRouteConfig({
  file,
  config,
}: {
  file: string;
  config: EcoPagesConfig;
}): Promise<RouteRendererConfig> {
  const descriptor = PathUtils.getNameDescriptor(file);

  switch (descriptor as DefaultTemplateEngines) {
    case "kita":
      const render = new RouteRenderer(new KitaRenderer());
      return render.createRoute({ file });
    default:
      throw new Error(`Unknown render type: ${descriptor}`);
  }
}

/**
 * Build the html pages based on the eco config.
 * @returns {BunPlugin}
 */
export function buildHtmlPages(): BunPlugin {
  return {
    name: "Build Eco Pages",
    setup(build) {
      build.onLoad({ filter: /\.tsx$/ }, async (args) => {
        const { ecoConfig: config } = globalThis;

        const route = await createRouteConfig({
          file: args.path,
          config,
        });

        const docType = "<!DOCTYPE html>";
        const htmlPath = getHtmlPath({
          file: args.path,
          pagesDir: path.join(config.rootDir, config.srcDir, config.pagesDir),
        });

        const relativeUrl = `${htmlPath}/index.html`;
        const distPath = `${config.distDir}${relativeUrl}`;
        const htmlPage = docType + route.html.toString();

        await FileUtils.write(distPath, htmlPage);

        return {
          then(onresolved, onrejected) {
            if (onresolved) onresolved({ contents: htmlPage, loader: "text" });
            if (onrejected) onrejected((reason: any) => console.error(reason));
          },
        };
      });
    },
  };
}
