import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { APP_TEST_ROUTES_URLS, FIXTURE_APP_PROJECT_DIR } from '../../../fixtures/constants.ts';
import { AppConfigurator } from '../../main/app-configurator.ts';
import { BunFileSystemServerAdapter } from './fs-server.ts';

let appConfigurator: AppConfigurator;
let server: Server;

describe('FileSystemServer', () => {
  beforeAll(async () => {
    appConfigurator = await AppConfigurator.create({
      projectDir: FIXTURE_APP_PROJECT_DIR,
    });
  });

  beforeEach(async () => {
    server = (
      await BunFileSystemServerAdapter.createServer({
        appConfig: appConfigurator.config,
        options: {
          watchMode: false,
        },
      })
    ).server;
  });

  afterEach(() => {
    server.stop(true);
  });

  test('should return 404 for non-existent file', async () => {
    const req = new Request(APP_TEST_ROUTES_URLS.nonExistentFile);
    const res = await server.fetch(req);

    expect(res.status).toBe(404);
  });

  test('should return 200 for existing file', async () => {
    const req = new Request(APP_TEST_ROUTES_URLS.existingCssFile);
    const res = await server.fetch(req);
    expect(res.headers.get('content-type')).toBe('text/css');
    expect(res.status).toBe(200);
  });

  test('should return 200 for existing page', async () => {
    const req = new Request(APP_TEST_ROUTES_URLS.index);
    const res = await server.fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(await res.text()).toContain('<!DOCTYPE html>');
  });

  test('should return 200 for existing page with query params', async () => {
    const req = new Request(APP_TEST_ROUTES_URLS.withQuery);
    const res = await server.fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(await res.text()).toContain('{&quot;page&quot;:&quot;1&quot;}');
  });

  test('should return 200 for dynamic page with params', async () => {
    const req = new Request(APP_TEST_ROUTES_URLS.dynamic);
    const res = await server.fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(await res.text()).toContain('<title>Hello World | 123</title>');
  });

  test('should return 200 for dynamic page with params and query params', async () => {
    const req = new Request(APP_TEST_ROUTES_URLS.dynamicWithQuery);
    const res = await server.fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(await res.text()).toContain('{&quot;page&quot;:&quot;1&quot;}');
  });

  test('should return 200 for catch all page with params', async () => {
    const req = new Request(APP_TEST_ROUTES_URLS.catchAll);
    const res = await server.fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(await res.text()).toContain('{&quot;path&quot;:[&quot;123&quot;,&quot;456&quot;]}');
  });

  test('should return custom error template for non-existent page', async () => {
    const req = new Request(APP_TEST_ROUTES_URLS.nonExistentPage);
    const res = await server.fetch(req);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<h1>404 - Page Not Found</h1>');
  });
});
