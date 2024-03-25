import path from "path";
import { createKitaRoute } from "@/plugins/build-html-pages/templates/create-kita-route";
import { FSRouter } from "./utils/fs-router";
import { withHtmlLiveReload, type PureWebSocketServeOptions } from "./utils/hmr";
import { getContentType } from "./utils/get-content-type";

const createBunServer = (options: PureWebSocketServeOptions<unknown>) => {
  return Bun.serve(withHtmlLiveReload(options, globalThis.ecoConfig));
};

async function getFile(filePath: string) {
  const file = Bun.file(filePath);
  if (!(await file.exists())) throw new Error("File not found");
  return file;
}

function shouldEnableGzip(contentType: string) {
  const gzipEnabledExtensions = ["application/javascript", "text/css"];
  return gzipEnabledExtensions.includes(contentType);
}

/**
 * @function createFsServer
 * @description
 * This function returns the development server using the fileRouter.
 */
export const createFsServer = async ({ gzip }: { gzip: boolean }) => {
  const {
    ecoConfig: { rootDir, srcDir, pagesDir, distDir },
  } = globalThis;

  const router = new FSRouter({
    dir: path.join(rootDir, srcDir, pagesDir),
    origin: "http://localhost:3000",
    assetPrefix: path.join(rootDir, distDir),
    fileExtensions: [".kita.tsx"],
  });

  await router.init();

  const serverOptions = {
    async fetch(req: Request) {
      const match = !req.url.includes(".") && router.match(req);

      if (!match) {
        const filePath = path.join(router.assetPrefix, req.url.replace(router.origin, ""));
        const contentType = getContentType(filePath);

        try {
          let file;
          let contentEncodingHeader: HeadersInit = {};

          if (gzip && shouldEnableGzip(contentType)) {
            const gzipPath = `${filePath}.gz`;
            file = await getFile(gzipPath);
            contentEncodingHeader["Content-Encoding"] = "gzip";
          } else {
            file = await getFile(filePath);
          }

          return new Response(file, {
            headers: {
              "Content-Type": contentType,
              ...contentEncodingHeader,
            },
          });
        } catch (err) {
          console.error(
            `[eco-pages] Error: ${filePath} not found in the file system. { gzip: ${gzip} }`
          );
        }
        return new Response("Not found", {
          status: 404,
        });
      }

      const page = await createKitaRoute({
        file: match.filePath,
        params: match.params,
        query: match.query,
      });

      if (match.strategy === "isg") {
        /**
         * @todo Implement Incremental Static Generation
         */
      }

      return new Response(await page.html, {
        headers: {
          "Content-Type": "text/html",
        },
      });
    },
  };

  const server = createBunServer(serverOptions);

  router.onReload = () => {
    server.reload(serverOptions);
  };

  return { router, server };
};
