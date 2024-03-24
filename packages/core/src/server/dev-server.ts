import { withHtmlLiveReload } from "./utils/hmr";
import path from "path";
import { statSync } from "fs";

/**
 * @function getContentType
 * @description
 * This function returns the content type of the given path.
 */
export function getContentType(path: string) {
  const ext = path.split(".").pop();
  if (ext === "js") return "application/javascript";
  if (ext === "css") return "text/css";
  if (ext === "html") return "text/html";
  if (ext === "json") return "application/json";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "gif") return "image/gif";
  if (ext === "ico") return "image/x-icon";
  return "text/plain";
}

/**
 * @function serveFromDir
 * @description
 * This function serves the file from the directory.
 * Optionally, it can serve the gzipped file if the gzip flag is set to true.
 */
function serveFromDir(config: { directory: string; path: string; gzip: boolean }): Response | null {
  const { rootDir } = globalThis.ecoConfig;
  let basePath = path.join(rootDir, config.directory, config.path);
  const contentType = getContentType(path.extname(basePath));

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
        headers: { "Content-Type": getContentType(path.extname(pathWithSuffix)) },
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
export const createDevServer = ({ gzip }: { gzip: boolean }) =>
  Bun.serve(
    withHtmlLiveReload(
      {
        fetch: (request) => {
          let reqPath = new URL(request.url).pathname;

          if (reqPath === "/") reqPath = "/index.html";

          const response = serveFromDir({
            directory: path.join(globalThis.ecoConfig.distDir),
            path: reqPath,
            gzip,
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
