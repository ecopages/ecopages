import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { APP_TEST_ROUTES, FIXTURE_APP_PROJECT_DIR, INDEX_TEMPLATE_FILE } from '../../../fixtures/constants.ts';
import type { MatchResult } from '../../internal-types.ts';
import { AppConfigurator } from '../../main/app-configurator.ts';
import { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import { FSRouterScanner } from '../../router/fs-router-scanner.ts';
import { FSRouter } from '../../router/fs-router.ts';
import { FileSystemServerResponseFactory } from './fs-server-response-factory.ts';
import { FileSystemResponseMatcher } from './fs-server-response-matcher.ts';

const appConfigurator = await AppConfigurator.create({
  projectDir: FIXTURE_APP_PROJECT_DIR,
});

const scanner = new FSRouterScanner({
  dir: path.join(appConfigurator.config.rootDir, appConfigurator.config.srcDir, appConfigurator.config.pagesDir),
  origin: appConfigurator.config.baseUrl,
  templatesExt: appConfigurator.config.templatesExt,
  options: {
    buildMode: false,
  },
});

const router = new FSRouter({
  origin: appConfigurator.config.baseUrl,
  assetPrefix: path.join(appConfigurator.config.rootDir, appConfigurator.config.distDir),
  scanner,
});

const routeRendererFactory = new RouteRendererFactory({
  appConfig: appConfigurator.config,
});

const fileSystemResponseFactory = new FileSystemServerResponseFactory({
  appConfig: appConfigurator.config,
  routeRendererFactory,
  options: {
    watchMode: false,
  },
});

const fileSystemResponseMatcher = new FileSystemResponseMatcher({
  router,
  routeRendererFactory,
  fileSystemResponseFactory,
});

describe('FileSystemResponseMatcher', () => {
  it('should handle no match for request URL', async () => {
    const requestUrl = APP_TEST_ROUTES.nonExistentFile;
    const response = await fileSystemResponseMatcher.handleNoMatch(requestUrl);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('file not found');
  });

  it('should handle match', async () => {
    const match: MatchResult = {
      kind: 'exact',
      pathname: APP_TEST_ROUTES.index,
      filePath: INDEX_TEMPLATE_FILE,
      params: {},
      query: {},
    };
    const response = await fileSystemResponseMatcher.handleMatch(match);
    expect(response.headers.get('Content-Type')).toBe('text/html');
  });
});
