import path from "path";
import { FSRouter, type MatchResult } from "./utils/fs-router";
import { withHtmlLiveReload, type PureWebSocketServeOptions } from "./utils/hmr";
import { getContentType } from "./utils/get-content-type";
import { RouteRendererFactory } from "@/render/route-renderer";

class FileSystemServer {
  private gzip: boolean;
  private router: FSRouter;
  private routeRendererFactory: RouteRendererFactory;
  private error404TemplatePath: string;
  private server: any;

  constructor({
    gzip,
    router,
    routeRendererFactory,
    error404TemplatePath,
  }: {
    gzip: boolean;
    router: FSRouter;
    routeRendererFactory: RouteRendererFactory;
    error404TemplatePath: string;
  }) {
    this.gzip = gzip;
    this.router = router;
    this.routeRendererFactory = routeRendererFactory;
    this.error404TemplatePath = error404TemplatePath;
  }

  private shouldEnableGzip(contentType: string) {
    const gzipEnabledExtensions = ["application/javascript", "text/css"];
    return gzipEnabledExtensions.includes(contentType);
  }

  private async getFile(filePath: string) {
    const file = Bun.file(filePath);
    if (!(await file.exists())) throw new Error("File not found");
    return file;
  }

  public async fetch(req: Request) {
    const match = !req.url.includes(".") && this.router.match(req);

    if (!match) {
      return this.handleNoMatch(req);
    }

    return this.handleMatch(match);
  }

  private async handleNoMatch(req: Request) {
    const filePath = path.join(this.router.assetPrefix, req.url.replace(this.router.origin, ""));
    const contentType = getContentType(filePath);

    if (this.isHtmlOrPlainText(contentType)) {
      return this.createHtmlResponse();
    }

    return this.createFileResponse(filePath, contentType);
  }

  private isHtmlOrPlainText(contentType: string) {
    return ["text/html", "text/plain"].includes(contentType);
  }

  private async createHtmlResponse() {
    const routeRenderer = this.routeRendererFactory.createRenderer(this.error404TemplatePath);

    const page = await routeRenderer.createRoute({
      file: this.error404TemplatePath,
    });

    return new Response(await page.html, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  }

  private async createFileResponse(filePath: string, contentType: string) {
    try {
      let file;
      let contentEncodingHeader: HeadersInit = {};

      if (this.gzip && this.shouldEnableGzip(contentType)) {
        const gzipPath = `${filePath}.gz`;
        file = await this.getFile(gzipPath);
        contentEncodingHeader["Content-Encoding"] = "gzip";
      } else {
        file = await this.getFile(filePath);
      }

      return new Response(file, {
        headers: {
          "Content-Type": contentType,
          ...contentEncodingHeader,
        },
      });
    } catch (error) {
      return new Response("file not found", {
        status: 404,
      });
    }
  }

  private async handleMatch(match: MatchResult) {
    const routeRenderer = this.routeRendererFactory.createRenderer(this.error404TemplatePath);

    const page = await routeRenderer.createRoute({
      file: match.filePath,
      params: match.params,
      query: match.query,
    });

    return new Response(await page.html, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  }

  public startServer(serverOptions: PureWebSocketServeOptions<unknown>) {
    this.server = globalThis.ecoConfig.watchMode
      ? Bun.serve(withHtmlLiveReload(serverOptions, globalThis.ecoConfig))
      : Bun.serve(serverOptions);

    this.router.onReload = () => {
      this.server.reload(serverOptions);
    };

    return { router: this.router, server: this.server };
  }
}

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

  const server = new FileSystemServer({
    gzip,
    router,
    routeRendererFactory: new RouteRendererFactory(),
    error404TemplatePath,
  });

  const serverOptions = {
    fetch: server.fetch.bind(server),
  };

  return server.startServer(serverOptions);
};
