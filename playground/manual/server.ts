import { withHtmlLiveReload } from '@ecopages/core/adapters/bun/hmr';
import { createBunServerAdapter } from '@ecopages/core/adapters/bun/server-adapter';
import { parseCliArgs } from '@ecopages/core/utils/parse-cli-args';
import { Logger } from '@ecopages/logger';
import type { Server } from 'bun';
import appConfig from './eco.config';

const appLogger = new Logger('[@ecopages/serve-options]');

const { watch, preview, build, port, hostname } = parseCliArgs();

const { serveOptions, buildStatic } = await createBunServerAdapter({
  appConfig,
  options: { watch: true },
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

const shouldUseHmr = watch || (!preview && !build);
const server = Bun.serve(shouldUseHmr ? withHtmlLiveReload(serveOptions, appConfig) : serveOptions);

if (build || preview) {
  await buildStatic({ preview: preview });
}

if (build) {
  appLogger.info('Build completed');
  server.stop(true);
  process.exit(0);
}
if (preview) {
  appLogger.info('Preview mode enabled');
  server.stop(true);
} else if (server) {
  appLogger.info(`Server running at http://${server.hostname}:${server.port}`);
}
