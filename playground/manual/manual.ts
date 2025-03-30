import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import { createBunServerAdapter } from '@ecopages/core/adapters/bun/server-adapter';
import { FileSystemServerResponseFactory } from '@ecopages/core/adapters/bun/shared/fs-server-response-factory';
import { FileSystemResponseMatcher } from '@ecopages/core/adapters/bun/shared/fs-server-response-matcher';
import { RouteRendererFactory } from '@ecopages/core/route-renderer/route-renderer';
import { FSRouter } from '@ecopages/core/router/fs-router';
import { FSRouterScanner } from '@ecopages/core/router/fs-router-scanner';
import { ScriptsBuilder } from '@ecopages/core/scripts-builder';
import { AssetsDependencyService } from '@ecopages/core/services/assets-dependency-service';
import { CssParserService } from '@ecopages/core/services/css-parser-service';
import { HtmlTransformerService } from '@ecopages/core/services/html-transformer-service';
import { PostCssProcessor } from '@ecopages/postcss-processor';
import type { Server } from 'bun';
import { appLogger } from '../../packages/core/src/global/app-logger';
import appConfig from './eco.config';

const WATCH_MODE = true;
const PORT = 3000;

const assetsDependencyService = new AssetsDependencyService({ appConfig });
const htmlTransformer = new HtmlTransformerService();
const cssParser = new CssParserService({ processor: PostCssProcessor, appConfig });
const scriptsBuilder = new ScriptsBuilder({ appConfig, options: { watchMode: WATCH_MODE } });

function copyPublicDir() {
  FileUtils.copyDirSync(
    path.join(appConfig.srcDir, appConfig.publicDir),
    path.join(appConfig.distDir, appConfig.publicDir),
  );
}

async function initializePlugins() {
  for (const processor of appConfig.processors.values()) {
    await processor.setup();
    assetsDependencyService.registerDependencies({
      name: processor.getName(),
      getDependencies: () => processor.getDependencies(),
    });
  }

  for (const integration of appConfig.integrations) {
    integration.setConfig(appConfig);
    integration.setDependencyService(assetsDependencyService);
    await integration.setup();
    assetsDependencyService.registerDependencies({
      name: integration.name,
      getDependencies: () => integration.getDependencies(),
    });
  }
}

const scanner = new FSRouterScanner({
  dir: path.join(appConfig.rootDir, appConfig.srcDir, appConfig.pagesDir),
  /**
   * Origin should be blank since we are now using Bun routes and we don't need the origin
   */
  origin: '',
  templatesExt: appConfig.templatesExt,
  options: {
    buildMode: !WATCH_MODE,
  },
});

const router = new FSRouter({
  /**
   * Origin should be blank since we are now using Bun routes and we don't need the origin
   */
  origin: '',
  assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
  scanner,
});

copyPublicDir();
await initializePlugins();
await cssParser.build();
await scriptsBuilder.build();

await router.init();

const routes: Record<string, (req: Request) => Promise<Response>> = {};

const routeRendererFactory = new RouteRendererFactory({
  appConfig,
});

async function transformIndexHtml(res: Response): Promise<Response> {
  const dependencies = await assetsDependencyService.prepareDependencies();
  htmlTransformer.setProcessedDependencies(dependencies);
  return htmlTransformer.transform(res);
}

const fileSystemResponseFactory = new FileSystemServerResponseFactory({
  appConfig,
  routeRendererFactory,
  transformIndexHtml,
  options: {
    watchMode: WATCH_MODE,
    port: PORT,
  },
});

const fileSystemResponseMatcher = new FileSystemResponseMatcher({
  router,
  routeRendererFactory,
  fileSystemResponseFactory,
});

async function handleResponse(req: Request) {
  const pathname = new URL(req.url).pathname;
  const match = !pathname.includes('.') && router.match(req.url);

  if (match) {
    const response = await fileSystemResponseMatcher.handleMatch(match);

    if (transformIndexHtml && response.headers.get('content-type')?.includes('text/html')) {
      return transformIndexHtml(response);
    }

    return response;
  }

  return fileSystemResponseMatcher.handleNoMatch(req.url.replace(router.origin, ''));
}

for (const pathname of Object.keys(router.routes)) {
  routes[pathname] = async (req: Request) => handleResponse(req);
}

const server = Bun.serve({
  port: 3000,
  routes,
  async fetch(req) {
    const pathname = new URL(req.url).pathname;
    return fileSystemResponseMatcher.handleNoMatch(pathname);
  },
});

appLogger.info(`Server running at http://localhost:${server.port}`);
