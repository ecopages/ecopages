import path from "path";
import { withHtmlLiveReload } from "./middleware/hmr";
import { ServerUtils } from "./server-utils";
import { statSync } from "fs";

/**
 * @function serveFromDir
 * @description
 * This function serves the file from the directory.
 * Optionally, it can serve the gzipped file if the gzip flag is set to true.
 */
export function serveFromDir(config: {
  directory: string;
  path: string;
  gzip: boolean;
}): Response | null {
  const { rootDir } = globalThis.ecoConfig;
  let basePath = path.join(rootDir, config.directory, config.path);
  const contentType = ServerUtils.getContentType(path.extname(basePath));

  if (config.gzip && ["application/javascript", "text/css"].includes(contentType)) {
    try {
      const gzipPath = `${basePath}.gz`;
      const stat = statSync(gzipPath);
      if (stat && stat.isFile()) {
        return new Response(Bun.file(gzipPath), {
          headers: {
            "Content-Type": contentType,
            "Content-Encoding": "gzip",
          },
        });
      }
    } catch (err) {
      console.error(`[eco-pages] Error: ${basePath}.gz not found`);
    }
  }

  if (config.path.includes(".")) {
    try {
      const stat = statSync(basePath);
      if (stat && stat.isFile())
        return new Response(Bun.file(basePath), {
          headers: { "Content-Type": contentType },
        });
    } catch (err) {
      console.error("[eco-pages] Error:", basePath, "not found");
    }
  }

  try {
    const pathWithSuffix = path.join(basePath, "index.html");
    const stat = statSync(pathWithSuffix);
    if (stat && stat.isFile())
      return new Response(Bun.file(pathWithSuffix), {
        headers: { "Content-Type": ServerUtils.getContentType(path.extname(pathWithSuffix)) },
      });
  } catch (err) {
    console.error("[eco-pages] Error:", path.join(basePath, "index.html"), "not found");
  }

  return null;
}

/**
 * @function createDevServer
 * @description
 * This function returns the development server.
 */
export const createDevServer = () =>
  Bun.serve(
    withHtmlLiveReload(
      {
        fetch: (request) => {
          let reqPath = new URL(request.url).pathname;

          if (reqPath === "/") reqPath = "/index.html";

          const response = serveFromDir({
            directory: path.join(globalThis.ecoConfig.distDir),
            path: reqPath,
            gzip: globalThis.ecoConfig.watchMode,
          });

          if (response) return response;

          return new Response("File not found", {
            status: 404,
          });
        },
      },
      globalThis.ecoConfig
    )
  );
