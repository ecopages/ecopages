import { createApp } from '@ecopages/core/adapters/bun/create-app';
import type { Server } from 'bun';
import appConfig from './eco.config';

const app = await createApp({
  appConfig,
  serverOptions: {
    fetch: async function (this: Server, request: Request) {
      const pathname = new URL(request.url).pathname;
      if (pathname.includes('/api/test')) {
        return new Response(JSON.stringify({ message: 'Hello from the API!' }));
      }
    },
  },
});

await app.start();
