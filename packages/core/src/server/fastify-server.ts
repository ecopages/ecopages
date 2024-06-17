import { watch } from 'node:fs';
import { appLogger } from '@/global/app-logger';
import { type Fastify, restartable } from '@fastify/restartable';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket, { type WebSocket } from '@fastify/websocket';
import type { EcoPagesConfig } from '@types';
import type { FastifyInstance } from 'fastify';
import type { FSRouter } from './router/fs-router';

declare global {
  var __ECO_PAGES_HMR_WS_FASTIFY__: WebSocket;
}

export const reloadCommand = 'reload';

globalThis.__ECO_PAGES_HMR_WS_FASTIFY__?.send(reloadCommand);

const makeLiveReloadScript = (wsUrl: string) => `
<!-- [ecopages] live reload start script -->
<script type="text/javascript">
  (function() {
    const socket = new WebSocket("ws://${wsUrl}");

    socket.onmessage = function(msg) {
      if(msg.data === '${reloadCommand}') {
        location.reload();
      }
    };

    socket.onerror = function(error) {
      console.error('Live reload connection error.',{error});
    };

    console.log('[ecopages] Live reload enabled');
  })();
</script>
<!-- [ecopages] live reload end script -->
`;

const WS_PATH = '__ecopages_live_reload_websocket__';

type FileSystemServerOptions = {
  watchMode: boolean;
  port?: number;
};

export class FastifyServer {
  private server: FastifyInstance | null = null;
  private appConfig: EcoPagesConfig;
  private router: FSRouter;
  private options: FileSystemServerOptions;
  private handleMatch: (match: any) => Promise<Response>;
  private handleNoMatch: (requestUrl: string) => Promise<Response>;

  constructor({
    appConfig,
    router,
    options,
    handleMatch,
    handleNoMatch,
  }: {
    appConfig: EcoPagesConfig;
    router: FSRouter;
    options: FileSystemServerOptions;
    handleMatch: (match: any) => Promise<Response>;
    handleNoMatch: (requestUrl: string) => Promise<Response>;
  }) {
    this.appConfig = appConfig;
    this.router = router;
    this.options = options;
    this.handleMatch = handleMatch;
    this.handleNoMatch = handleNoMatch;
  }

  async createServer(fastify: Fastify) {
    this.server = fastify();

    if (!this.server) {
      throw new Error('Server not initialized');
    }

    const watcher = watch(this.appConfig.absolutePaths.srcDir, { recursive: true });

    this.server.register(fastifyStatic, {
      root: this.appConfig.absolutePaths.distDir,
      prefix: `/${this.appConfig.publicDir}`,
    });

    this.server.get('*', async (request, reply) => {
      const requestUrl = this.appConfig.baseUrl + request.raw.url;

      const match = this.router.match(requestUrl);

      if (!match) {
        const renderedBody = await this.handleNoMatch(request.raw.url as string);
        return reply.type('text/html').send(renderedBody);
      }

      const renderedBody = await this.handleMatch(match);

      if (!renderedBody.headers.get('Content-Type')?.startsWith('text/html')) {
        return reply.type('text/html').send(renderedBody);
      }

      const wsUrl = `${request.hostname}/${WS_PATH}`;

      const closingTags = '</body></html>';
      const originalHtml = await renderedBody.text();
      const liveReloadScript = makeLiveReloadScript(wsUrl);
      const htmlWithLiveReload = originalHtml.replace(closingTags, '') + liveReloadScript + closingTags;

      return reply.type('text/html').send(htmlWithLiveReload);
    });

    if (this.options.watchMode) {
      this.server.register(fastifyWebsocket);

      this.server.register(async (fastify) => {
        fastify.get(`/${WS_PATH}`, { websocket: true }, (socket) => {
          globalThis.__ECO_PAGES_HMR_WS_FASTIFY__ = socket;
          if (watcher) {
            watcher.removeAllListeners('change');
            watcher.once('change', async (r) => {
              socket.send(reloadCommand);
            });
          }
        });
      });
    }

    return this.server;
  }

  static async serve({
    appConfig,
    router,
    options,
    handleMatch,
    handleNoMatch,
  }: {
    appConfig: EcoPagesConfig;
    router: FSRouter;
    options: FileSystemServerOptions;
    handleMatch: (match: any) => Promise<Response>;
    handleNoMatch: (requestUrl: string) => Promise<Response>;
  }): Promise<{ server: Awaited<ReturnType<typeof restartable>> }> {
    try {
      const fastify = new FastifyServer({
        appConfig,
        router,
        options,
        handleMatch,
        handleNoMatch,
      });

      const server = await restartable(fastify.createServer.bind(fastify));

      const host = await server.listen({
        port: options.port,
      });

      appLogger.info(`Server listening on ${host}`);

      process.once('SIGINT', () => {
        console.log('Stopping the server');
        server.close();
      });

      return { server };
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  }
}
