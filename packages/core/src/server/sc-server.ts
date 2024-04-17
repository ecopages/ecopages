import { extname, join } from 'node:path';
import { RouteRendererFactory } from '@/render/route-renderer';
import { FileUtils } from '@/utils/file-utils.module';
import type { EcoPagesConfig } from '@types';
import type { Server } from 'bun';
import { withHtmlLiveReload } from './middleware/hmr';
import { ServerUtils } from './server-utils.module';

type StaticContentServerOptions = {
  watchMode: boolean;
};

export class StaticContentServer {
  server: Server | null = null;
  private config: EcoPagesConfig;
  private options: StaticContentServerOptions;
  private routeRendererFactory: RouteRendererFactory;

  constructor({
    config,
    options,
    routeRendererFactory,
  }: {
    config: EcoPagesConfig;
    options: StaticContentServerOptions;
    routeRendererFactory: RouteRendererFactory;
  }) {
    this.config = config;
    this.options = options;
    this.routeRendererFactory = routeRendererFactory;
    this.startServer();
  }

  private shouldServeGzip(contentType: ReturnType<typeof ServerUtils.getContentType>) {
    return !this.options.watchMode && ['application/javascript', 'text/css'].includes(contentType);
  }

  private async sendNotFoundPage() {
    const error404TemplatePath = this.config.absolutePaths.error404TemplatePath;

    try {
      await FileUtils.get(error404TemplatePath);
    } catch (error) {
      return new Response('file not found', {
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
    const { absolutePaths } = this.config;
    const basePath = join(absolutePaths.distDir, path);
    const contentType = ServerUtils.getContentType(extname(basePath));

    try {
      if (this.shouldServeGzip(contentType)) {
        const gzipPath = `${basePath}.gz`;
        const file = await FileUtils.get(gzipPath);
        return new Response(file, {
          headers: {
            'Content-Type': contentType,
            'Content-Encoding': 'gzip',
          },
        });
      }

      if (path.includes('.')) {
        const file = await FileUtils.get(basePath);
        return new Response(file, {
          headers: { 'Content-Type': contentType },
        });
      }

      const pathWithSuffix = join(basePath, 'index.html');

      const file = await FileUtils.get(pathWithSuffix);

      return new Response(file, {
        headers: {
          'Content-Type': ServerUtils.getContentType(extname(pathWithSuffix)),
        },
      });
    } catch (error) {
      return this.sendNotFoundPage();
    }
  }

  private getOptions() {
    return withHtmlLiveReload(
      {
        fetch: (request) => {
          let reqPath = new URL(request.url).pathname;

          if (reqPath === '/') reqPath = '/index.html';

          const response = this.serveFromDir({
            path: reqPath,
          });

          if (response) return response;

          return new Response('File not found', {
            status: 404,
          });
        },
      },
      this.config,
    );
  }

  private startServer() {
    this.server = Bun.serve(this.getOptions());
  }

  stop() {
    if (this.server) {
      this.server.stop();
    }
  }

  static create({ watchMode }: { watchMode: boolean }) {
    return new StaticContentServer({
      config: globalThis.ecoConfig,
      routeRendererFactory: new RouteRendererFactory(),
      options: { watchMode },
    });
  }
}
