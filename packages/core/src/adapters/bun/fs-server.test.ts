import { describe, expect, test } from 'bun:test';
import { FIXTURE_PROJECT_DIR } from '../../../fixtures/constants.ts';
import { FIXTURE_EXISTING_FILE_IN_DIST } from '../../../fixtures/constants.ts';
import { AppConfigurator } from '../../main/app-configurator.ts';
import { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import { FSRouterScanner } from '../../router/fs-router-scanner.ts';
import { FSRouter } from '../../router/fs-router.ts';
import { BunFileSystemServerAdapter } from './fs-server.ts';

const appConfigurator = await AppConfigurator.create({
  projectDir: FIXTURE_PROJECT_DIR,
});

const {
  templatesExt,
  integrations,
  absolutePaths: { pagesDir, distDir },
} = appConfigurator.config;

const routeRendererFactory = new RouteRendererFactory({
  integrations,
  appConfig: appConfigurator.config,
});

const scanner = new FSRouterScanner({
  dir: pagesDir,
  origin: 'http://localhost:3000',
  templatesExt,
  options: {
    buildMode: true,
  },
});

const router = new FSRouter({
  origin: 'http://localhost:3000',
  assetPrefix: distDir,
  scanner,
});

await router.init();

const server = new BunFileSystemServerAdapter({
  appConfig: appConfigurator.config,
  router,
  routeRendererFactory,
  options: { watchMode: false },
});

describe('FileSystemServer', async () => {
  test('should return 404 for non-existent file', async () => {
    const req = new Request('http://localhost:3000/non-existent-file.css');
    const res = await server.fetch(req);

    expect(res.status).toBe(404);
  });

  test('should return 200 for existing file', async () => {
    const req = new Request(`http://localhost:3000/${FIXTURE_EXISTING_FILE_IN_DIST}`);
    const res = await server.fetch(req);
    expect(res.headers.get('content-type')).toBe('text/css');
    expect(res.status).toBe(200);
  });

  test('should return 200 for existing page', async () => {
    const req = new Request('http://localhost:3000');
    const res = await server.fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(await res.text()).toContain('<!DOCTYPE html>');
  });

  test('should return 200 for existing page with query params', async () => {
    const req = new Request('http://localhost:3000?page=1');
    const res = await server.fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(await res.text()).toContain('{&quot;page&quot;:&quot;1&quot;}');
  });

  test('should return 200 for dynamic page with params', async () => {
    const req = new Request('http://localhost:3000/dynamic/123');
    const res = await server.fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(await res.text()).toContain('<title>Hello World | 123</title>');
  });

  test('should return 200 for dynamic page with params and query params', async () => {
    const req = new Request('http://localhost:3000/dynamic/123?page=1');
    const res = await server.fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(await res.text()).toContain('{&quot;page&quot;:&quot;1&quot;}');
  });

  test('should return 200 for catch all page with params', async () => {
    const req = new Request('http://localhost:3000/catch-all/123/456');
    const res = await server.fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(await res.text()).toContain('{&quot;path&quot;:[&quot;123&quot;,&quot;456&quot;]}');
  });

  test('should return custom error template for non-existent page', async () => {
    const req = new Request('http://localhost:3000/non-existent-page');
    const res = await server.fetch(req);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<h1>404 - Page Not Found</h1>');
  });

  test('should return 200 for page rendered using mdx', async () => {
    const req = new Request('http://localhost:3000/mdx-test');
    const res = await server.fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
    const resText = await res.text();
    expect(resText).toContain('<h1>MDX Page</h1>');
    expect(resText).toContain('<p>This is a copy included via tsx</p>');
  });
});
