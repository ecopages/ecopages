import { withHtmlLiveReload } from "./hmr";
import path from "path";
import { statSync } from "fs";
import type { EcoPagesConfig } from "../eco-pages.types";

function getContentType(path: string) {
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

function serveFromDir(config: { directory: string; path: string }): Response | null {
  const basePath = path.join(config.directory, config.path);
  const suffixes = ["index.html"];

  if (config.path.includes(".")) {
    try {
      const stat = statSync(basePath);
      if (stat && stat.isFile())
        return new Response(Bun.file(basePath), {
          headers: { "Content-Type": getContentType(path.extname(basePath)) },
        });
    } catch (err) {
      console.error(err);
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
    console.error(err);
  }

  return null;
}

export const devServer = ({ config }: { config: EcoPagesConfig }) =>
  Bun.serve(
    withHtmlLiveReload(
      {
        fetch: (request) => {
          let reqPath = new URL(request.url).pathname;

          if (reqPath === "/") reqPath = "/index.html";

          const response = serveFromDir({
            directory: path.join(config.distDir),
            path: reqPath,
          });

          if (response) return response;

          return new Response("File not found", {
            status: 404,
          });
        },
      },
      config
    )
  );
