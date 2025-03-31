import { withHtmlLiveReload } from '@ecopages/core/adapters/bun/hmr';
import { createBunServerAdapter } from '@ecopages/core/adapters/bun/server-adapter';
import { Logger } from '@ecopages/logger';
import type { Server } from 'bun';
import appConfig from './eco.config';

const appLogger = new Logger('[@ecopages/serve-options]');

const watchMode = true;

const serveOptions = await createBunServerAdapter({
  appConfig,
  options: { watch: true },
  serveOptions: {
    port: 3000,
    hostname: 'localhost',
    fetch: async function (this: Server, request: Request) {
      const pathname = new URL(request.url).pathname;
      if (pathname.includes('/api/test')) {
        return new Response('Api test');
      }
    },
  },
});

const server = Bun.serve(watchMode ? withHtmlLiveReload(serveOptions, appConfig) : serveOptions);

appLogger.info(`Server running at http://localhost:${server.port}`);
