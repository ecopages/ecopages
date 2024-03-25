import path from "path";
import { FSRouter } from "./utils/fs-router";
import { withHtmlLiveReload, type PureWebSocketServeOptions } from "./utils/hmr";
import { getContentType } from "./utils/get-content-type";
import { RouteRenderer } from "@/render/route-renderer";
import { KitaRenderer } from "@/render/strategies/kita-rendererer";

const createBunServer = (options: PureWebSocketServeOptions<unknown>) => {
  return globalThis.ecoConfig.watchMode
    ? Bun.serve(withHtmlLiveReload(options, globalThis.ecoConfig))
    : Bun.serve(options);
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
    ecoConfig: {
      rootDir,
      srcDir,
      pagesDir,
      distDir,
      derivedPaths: { error404TemplatePath },
    },
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

      const renderer = new RouteRenderer(new KitaRenderer());

      if (!match) {
        const filePath = path.join(router.assetPrefix, req.url.replace(router.origin, ""));
        const contentType = getContentType(filePath);

        if (["text/html", "text/plain"].includes(contentType)) {
          const page = await renderer.createRoute({
            file: error404TemplatePath,
          });
          return new Response(await page.html, {
            headers: {
              "Content-Type": "text/html",
            },
          });
        }

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
        } catch (error) {
          console.error(
            `[eco-pages] Error: ${filePath} not found in the file system. { gzip: ${gzip} }`,
            { error }
          );
        }

        return new Response("file not found", {
          status: 404,
        });
      }

      const page = await renderer.createRoute({
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
