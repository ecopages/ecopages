import { createServerAdapter } from '@ecopages/core/adapters/bun/server-adapter';
import { parseCliArgs } from '@ecopages/core/utils/parse-cli-args';
import { Logger } from '@ecopages/logger';
import type { Server } from 'bun';
import appConfig from './eco.config';

const appLogger = new Logger('[playground-manual]');

const { watch, preview, build, port, hostname } = parseCliArgs();

const { getServerOptions, buildStatic } = await createServerAdapter({
  appConfig,
  options: { watch },
  serveOptions: {
    port,
    hostname,
    fetch: async function (this: Server, request: Request) {
      const pathname = new URL(request.url).pathname;
      if (pathname.includes('/api/test')) {
        return new Response('Api test');
      }
    },
  },
});

const enableHmr = watch || (!preview && !build);
const server = Bun.serve(getServerOptions({ enableHmr }));

if (!build && !preview) {
  appLogger.info(`Server running at http://${server.hostname}:${server.port}`);
}

if (build || preview) {
  appLogger.debugTime('Building static pages');
  await buildStatic({ preview });
  server.stop(true);
  appLogger.debugTimeEnd('Building static pages');
}

if (build) {
  process.exit(0);
}

if (preview) {
  appLogger.info(`Preview running at http://${server.hostname}:${server.port}`);
}
