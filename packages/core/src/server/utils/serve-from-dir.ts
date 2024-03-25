import path from "path";
import { statSync } from "fs";
import { getContentType } from "./get-content-type";

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
