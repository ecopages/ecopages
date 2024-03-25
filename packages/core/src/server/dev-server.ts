import path from "path";
import { withHtmlLiveReload } from "./utils/hmr";
import { serveFromDir } from "./utils/serve-from-dir";

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
