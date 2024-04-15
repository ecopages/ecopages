import path from "path";
import { FSRouter, type MatchResult } from "./router/fs-router";
import { withHtmlLiveReload, type PureWebSocketServeOptions } from "./middleware/hmr";
import { ServerUtils } from "./server-utils";
import { RouteRendererFactory, type RouteRendererBody } from "@/render/route-renderer";
import { FileUtils } from "@/utils/file-utils";
import { FSRouterScanner } from "./router/fs-router-scanner";
import type { EcoPagesConfig } from "@types";

type FileSystemServerOptions = {
  watchMode: boolean;
};

export class FileSystemServer {
  private appConfig: EcoPagesConfig;
  private router: FSRouter;
  private routeRendererFactory: RouteRendererFactory;
  private error404TemplatePath: string;
  private server: any;
  private options: FileSystemServerOptions;

  constructor({
    router,
    appConfig,
    routeRendererFactory,
    error404TemplatePath,
    options,
  }: {
    router: FSRouter;
    appConfig: EcoPagesConfig;
    routeRendererFactory: RouteRendererFactory;
    error404TemplatePath: string;
    options: FileSystemServerOptions;
  }) {
    this.router = router;
    this.appConfig = appConfig;
    this.routeRendererFactory = routeRendererFactory;
    this.error404TemplatePath = error404TemplatePath;
    this.options = options;
  }

  private shouldEnableGzip(contentType: string) {
    if (this.options.watchMode) return false;
    const gzipEnabledExtensions = ["application/javascript", "text/css"];
    return gzipEnabledExtensions.includes(contentType);
  }

  private async getFile(filePath: string) {
    return await FileUtils.get(filePath);
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
    const contentType = ServerUtils.getContentType(filePath);

    if (this.isHtmlOrPlainText(contentType)) {
      return this.sendNotFoundPage();
    }

    return this.createFileResponse(filePath, contentType);
  }

  private isHtmlOrPlainText(contentType: string) {
    return ["text/html", "text/plain"].includes(contentType);
  }

  private sendResponse(routeRendererBody: RouteRendererBody) {
    const isAsync = routeRendererBody.constructor.name === "AsyncFunction";

    return new Response(routeRendererBody as any, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  }

  private async sendNotFoundPage() {
    const routeRenderer = this.routeRendererFactory.createRenderer(this.error404TemplatePath);

    const routeRendererConfig = await routeRenderer.createRoute({
      file: this.error404TemplatePath,
    });

    return this.sendResponse(routeRendererConfig);
  }

  private async createFileResponse(filePath: string, contentType: string) {
    try {
      let file;
      let contentEncodingHeader: HeadersInit = {};

      if (this.shouldEnableGzip(contentType)) {
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
    const routeRenderer = this.routeRendererFactory.createRenderer(match.filePath);

    const routeRendererConfig = await routeRenderer.createRoute({
      file: match.filePath,
      params: match.params,
      query: match.query,
    });

    return this.sendResponse(routeRendererConfig);
  }

  public startServer(serverOptions: PureWebSocketServeOptions<unknown>) {
    this.server = this.options.watchMode
      ? Bun.serve(withHtmlLiveReload(serverOptions, this.appConfig))
      : Bun.serve(serverOptions);

    this.router.onReload = () => {
      this.server.reload(serverOptions);
    };

    return { router: this.router, server: this.server };
  }

  static async create(options: FileSystemServerOptions) {
    const { ecoConfig } = globalThis;

    const scanner = new FSRouterScanner({
      dir: path.join(ecoConfig.rootDir, ecoConfig.srcDir, ecoConfig.pagesDir),
      origin: "http://localhost:3000",
      templatesExt: ecoConfig.templatesExt,
      options: {
        buildMode: !options.watchMode,
      },
    });

    const router = new FSRouter({
      origin: "http://localhost:3000",
      assetPrefix: path.join(ecoConfig.rootDir, ecoConfig.distDir),
      scanner,
    });

    await router.init();

    const server = new FileSystemServer({
      router,
      appConfig: ecoConfig,
      routeRendererFactory: new RouteRendererFactory(),
      error404TemplatePath: ecoConfig.absolutePaths.error404TemplatePath,
      options,
    });

    const serverOptions = {
      fetch: server.fetch.bind(server),
    };

    return server.startServer(serverOptions);
  }
}
