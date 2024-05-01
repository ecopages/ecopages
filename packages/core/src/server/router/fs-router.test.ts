import { describe, expect, test } from 'bun:test';
import { AppConfigurator } from '@/main/app-configurator';
import { FIXTURE_PROJECT_DIR } from 'fixtures/constants';
import { FSRouter, type Route } from './fs-router';
import { FSRouterScanner } from './fs-router-scanner';

await AppConfigurator.create({
  projectDir: FIXTURE_PROJECT_DIR,
});

const {
  templatesExt,
  absolutePaths: { pagesDir, distDir },
} = globalThis.ecoConfig;

const scanner = new FSRouterScanner({
  dir: pagesDir,
  origin: 'http://localhost:3000',
  templatesExt,
  options: {
    buildMode: false,
  },
});

const router = new FSRouter({
  origin: 'http://localhost:3000',
  assetPrefix: distDir,
  scanner,
});

await router.init();

describe('FSRouter', async () => {
  describe('init', async () => {
    test('should scan and return routes', async () => {
      expect(Object.keys(router.routes).length).toBe(5);
    });
  });

  describe('getDynamicParams', async () => {
    test.each([
      ['/products/[id]', '/products/123', { id: '123' }],
      ['/products/[id]', '/products/123/456', { id: '123' }],
      ['/products/[id]', '/products/123/456/789', { id: '123' }],
    ])('dynamic route %p with URL %p should have dynamic params %p', async (dynamicPathname, pathname, expected) => {
      const route: Route = {
        filePath: '',
        kind: 'dynamic',
        pathname: dynamicPathname,
      };
      const params = router.getDynamicParams(route, pathname);

      expect(params).toEqual(expected);
    });

    test.each([
      ['/products/[...id]', '/products/123/456/789', { id: ['123', '456', '789'] }],
      ['/products/[...id]', '/products/123', { id: ['123'] }],
      ['/products/[...id]', '/products', { id: [] }],
    ])('catch-all route %p with URL %p should have dynamic params %p', async (catchAllRoute, pathname, expected) => {
      const route: Route = {
        filePath: '',
        kind: 'dynamic',
        pathname: catchAllRoute,
      };
      const params = router.getDynamicParams(route, pathname);

      expect(params).toEqual(expected);
    });
  });
});
