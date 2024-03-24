import path from "path";
import { createKitaRoute } from "@/plugins/build-html-pages/templates/create-kita-route";
import { getContentType } from "./dev-server";
import { FSRouter } from "./utils/fs-router";
import { withHtmlLiveReload } from "./utils/hmr";

/**
 * @function createFsDevServer
 * @description
 * This function returns the development server using the fileRouter.
 */
export const createFsDevServer = async ({ gzip }: { gzip: boolean }) => {
  const {
    ecoConfig: { rootDir, srcDir, pagesDir, distDir },
  } = globalThis;

  const router = new FSRouter({
    dir: path.join(rootDir, srcDir, pagesDir),
    origin: "http://localhost:3000",
    assetPrefix: path.join(rootDir, distDir),
    fileExtensions: [".kita.tsx"],
  });

  await router.getRoutes();

  const server = Bun.serve(
    withHtmlLiveReload(
      {
        async fetch(req) {
          const match = !req.url.includes(".") && router.match(req);

          if (!match) {
            const filePath = path.join(router.assetPrefix, req.url.replace(router.origin, ""));
            const fileToServe = gzip ? `${filePath}.gz` : filePath;

            return new Response(Bun.file(fileToServe), {
              headers: {
                "Content-Type": getContentType(filePath),
              },
            });
          }

          const page = await createKitaRoute({
            config: globalThis.ecoConfig,
            file: match.filePath,
            params: match.params,
            query: match.query,
          });

          return new Response(await page.html, {
            headers: {
              "Content-Type": "text/html",
            },
          });
        },
      },
      globalThis.ecoConfig
    )
  );

  return { router, server };
};
