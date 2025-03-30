import { createBunServerAdapter } from '@ecopages/core/adapters/bun/server-adapter';
import type { Server } from 'bun';
import { appLogger } from '../../packages/core/src/global/app-logger';
import appConfig from './eco.config';

const server = await createBunServerAdapter({
  serve: Bun.serve,
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

appLogger.info(`Server running at http://localhost:${server.port}`);
