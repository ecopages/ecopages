import { extname, join } from 'node:path';
import type { EcoPagesAppConfig } from '@/internal-types';
import { RouteRendererFactory } from '@/route-renderer/route-renderer';
import { FileUtils } from '@/utils/file-utils.module';
import type { Server } from 'bun';
import { ServerUtils } from '../server-utils.module';
import { withHtmlLiveReload } from './hmr';

type StaticContentServerOptions = {
  watchMode: boolean;
};

export class StaticContentServer {
  server: Server | null = null;
  private config: EcoPagesAppConfig;
  private options: StaticContentServerOptions;
  private routeRendererFactory: RouteRendererFactory;

  constructor({
    config,
    options,
    routeRendererFactory,
  }: {
    config: EcoPagesAppConfig;
    options: StaticContentServerOptions;
    routeRendererFactory: RouteRendererFactory;
  }) {
    this.config = config;
    this.options = options;
    this.routeRendererFactory = routeRendererFactory;
    this.startServer();
  }

  private shouldServeGzip(contentType: ReturnType<typeof ServerUtils.getContentType>) {
    return !this.options.watchMode && ['text/javascript', 'text/css'].includes(contentType);
  }

  private async sendNotFoundPage() {
    const error404TemplatePath = this.config.absolutePaths.error404TemplatePath;

    try {
      FileUtils.existsSync(error404TemplatePath);
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

      const pathWithSuffix = join(basePath, 'index.html');

      const file = FileUtils.getFileAsBuffer(pathWithSuffix);

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
    return {
      fetch: (request: Request) => {
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
    };
  }

  private startServer() {
    if (!this.options.watchMode)
      this.server = this.options.watchMode
        ? Bun.serve(withHtmlLiveReload(this.getOptions(), this.config))
        : Bun.serve(this.getOptions());
  }

  stop() {
    if (this.server) {
      this.server.stop();
    }
  }

  static create({
    appConfig,
    options: { watchMode },
  }: {
    appConfig: EcoPagesAppConfig;
    options: StaticContentServerOptions;
  }) {
    return new StaticContentServer({
      config: appConfig,
      routeRendererFactory: new RouteRendererFactory({
        integrations: appConfig.integrations,
        appConfig: appConfig,
      }),
      options: { watchMode },
    });
  }
}
