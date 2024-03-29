import path from "path";
import { withHtmlLiveReload } from "./middleware/hmr";
import { ServerUtils } from "./server-utils";

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

          const response = ServerUtils.serveFromDir({
            directory: path.join(globalThis.ecoConfig.distDir),
            path: reqPath,
            gzip: !globalThis.ecoConfig.watchMode,
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
