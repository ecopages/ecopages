import { join, extname } from "path";
import { withHtmlLiveReload } from "./middleware/hmr";
import { ServerUtils } from "./server-utils";
import { FileUtils } from "@/utils/file-utils";
import type { EcoPagesConfig } from "@types";
import type { Server } from "bun";

type StaticContentServerOptions = {
  watchMode: boolean;
};

export class StaticContentServer {
  config: EcoPagesConfig;
  server: Server | null = null;
  options: StaticContentServerOptions;

  constructor({
    config,
    options,
  }: {
    config: EcoPagesConfig;
    options: StaticContentServerOptions;
  }) {
    this.config = config;
    this.options = options;
    this.create();
  }

  private shouldServeGzip(contentType: ReturnType<typeof ServerUtils.getContentType>) {
    return !this.options.watchMode && ["application/javascript", "text/css"].includes(contentType);
  }

  private async serveFromDir({ path }: { path: string }): Promise<Response> {
    const { rootDir, absolutePaths: derivedPaths } = this.config;
    let basePath = join(derivedPaths.distDir, path);
    const contentType = ServerUtils.getContentType(extname(basePath));

    if (this.shouldServeGzip(contentType)) {
      const gzipPath = `${basePath}.gz`;
      const file = await FileUtils.get(gzipPath);
      return new Response(file, {
        headers: {
          "Content-Type": contentType,
          "Content-Encoding": "gzip",
        },
      });
    }

    if (path.includes(".")) {
      const file = await FileUtils.get(basePath);
      return new Response(file, {
        headers: { "Content-Type": contentType },
      });
    }

    const pathWithSuffix = join(basePath, "index.html");
    const file = await FileUtils.get(pathWithSuffix);
    return new Response(file, {
      headers: { "Content-Type": ServerUtils.getContentType(extname(pathWithSuffix)) },
    });
  }

  private getOptions() {
    return withHtmlLiveReload(
      {
        fetch: (request) => {
          let reqPath = new URL(request.url).pathname;

          if (reqPath === "/") reqPath = "/index.html";

          const response = this.serveFromDir({
            path: reqPath,
          });

          if (response) return response;

          return new Response("File not found", {
            status: 404,
          });
        },
      },
      this.config
    );
  }

  private create() {
    this.server = Bun.serve(this.getOptions());
  }

  stop() {
    if (this.server) {
      this.server.stop();
    }
  }
}

export const createStaticContentServer = ({ watchMode }: { watchMode: boolean }) => {
  return new StaticContentServer({ config: globalThis.ecoConfig, options: { watchMode } });
};
