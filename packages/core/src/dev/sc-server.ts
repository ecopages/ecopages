import { extname, join } from 'node:path';
import type { Server } from 'bun';
import { STATUS_MESSAGE } from '../constants.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import { RouteRendererFactory } from '../route-renderer/route-renderer.ts';
import { FileUtils } from '../utils/file-utils.module.ts';
import { ServerUtils } from '../utils/server-utils.module.ts';

type StaticContentServerOptions = {
  port?: number;
};

export class StaticContentServer {
  server: Server | null = null;
  private appConfig: EcoPagesAppConfig;
  private options: StaticContentServerOptions = { port: 3000 };
  private routeRendererFactory: RouteRendererFactory;

  constructor({
    appConfig,
    options,
    routeRendererFactory,
  }: {
    appConfig: EcoPagesAppConfig;
    options?: StaticContentServerOptions;
    routeRendererFactory: RouteRendererFactory;
  }) {
    this.appConfig = appConfig;
    this.routeRendererFactory = routeRendererFactory;
    if (options) this.options = options;
    this.startServer();
  }

  private shouldServeGzip(contentType: ReturnType<typeof ServerUtils.getContentType>) {
    return ['text/javascript', 'text/css'].includes(contentType);
  }

  private isHtmlOrPlainText(contentType: string) {
    return ['text/html', 'text/plain'].includes(contentType);
  }

  private async sendNotFoundPage() {
    const error404TemplatePath = this.appConfig.absolutePaths.error404TemplatePath;

    try {
      FileUtils.existsSync(error404TemplatePath);
    } catch (error) {
      return new Response(STATUS_MESSAGE[404], {
        status: 404,
      });
    }

    const routeRenderer = this.routeRendererFactory.createRenderer(error404TemplatePath);

    const routeRendererConfig = await routeRenderer.createRoute({
      file: error404TemplatePath,
    });

    return new Response(routeRendererConfig as BodyInit, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  private async serveFromDir({ path }: { path: string }): Promise<Response> {
    const { absolutePaths } = this.appConfig;
    const basePath = join(absolutePaths.distDir, path);
    const contentType = ServerUtils.getContentType(extname(basePath));

    try {
      if (this.shouldServeGzip(contentType)) {
        const gzipPath = `${basePath}.gz`;
        const file = FileUtils.getFileAsBuffer(gzipPath);
        return new Response(file, {
          headers: {
            'Content-Type': contentType,
            'Content-Encoding': 'gzip',
          },
        });
      }

      if (path.includes('.')) {
        const file = FileUtils.getFileAsBuffer(basePath);
        return new Response(file, {
          headers: { 'Content-Type': contentType },
        });
      }

      let pathWithSuffix = `${basePath}.html`;

      const fileExists = FileUtils.existsSync(pathWithSuffix);

      if (!fileExists) pathWithSuffix = `${basePath}/index.html`;

      const file = FileUtils.getFileAsBuffer(pathWithSuffix);

      return new Response(file, {
        headers: {
          'Content-Type': ServerUtils.getContentType(extname(pathWithSuffix)),
        },
      });
    } catch (error) {
      if (this.isHtmlOrPlainText(contentType)) return this.sendNotFoundPage();
      return new Response(STATUS_MESSAGE[404], {
        status: 404,
      });
    }
  }

  async fetch(request: Request) {
    let reqPath = new URL(request.url).pathname;

    if (reqPath === '/') reqPath = '/index.html';

    const response = this.serveFromDir({
      path: reqPath,
    });

    if (response) return response;

    return new Response(STATUS_MESSAGE[404], {
      status: 404,
    });
  }

  private startServer() {
    this.server = Bun.serve({ fetch: this.fetch.bind(this), port: this.options.port });
  }

  stop() {
    if (this.server) {
      this.server.stop(true);
    }
  }

  static createServer({
    appConfig,
    options,
  }: {
    appConfig: EcoPagesAppConfig;
    options?: StaticContentServerOptions;
  }) {
    const routeRendererFactory = new RouteRendererFactory({
      appConfig,
    });

    return new StaticContentServer({
      appConfig: appConfig,
      routeRendererFactory,
      options,
    });
  }
}
