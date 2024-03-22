import { type DefaultTemplateFormats, type EcoPagesConfig, type RenderRouteConfig } from "@types";
import type { BunPlugin } from "bun";
import { createKitaRoute } from "./templates/create-kita-route";
import path from "node:path";

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
 * @returns {Promise<RenderRouteConfig>}
 */
export async function createRouteConfig({
  file,
  config,
}: {
  file: string;
  config: EcoPagesConfig;
}): Promise<RenderRouteConfig> {
  const renderType = file.split(".").at(-2) as DefaultTemplateFormats;

  switch (renderType) {
    case "kita":
      return await createKitaRoute({ file, config });
    default:
      throw new Error(`Unknown render type: ${renderType}`);
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
        try {
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

          await Bun.write(distPath, htmlPage);

          return {
            then(onresolved, onrejected) {
              if (onresolved) onresolved({ contents: htmlPage, loader: "text" });
              if (onrejected) onrejected((reason: any) => console.error(reason));
            },
          };
        } catch (error) {
          console.error(error);
          return null;
        }
      });
    },
  };
}
