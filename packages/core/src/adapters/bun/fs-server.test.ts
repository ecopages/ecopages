import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { APP_TEST_ROUTES_URLS, FIXTURE_APP_BASE_URL, FIXTURE_APP_PROJECT_DIR } from '../../../fixtures/constants.ts';
import { ConfigBuilder } from '../../config/config-builder.ts';
import { BunFileSystemServerAdapter } from './fs-server.ts';

const appConfig = await new ConfigBuilder()
  .setRootDir(FIXTURE_APP_PROJECT_DIR)
  .setBaseUrl(FIXTURE_APP_BASE_URL)
  .build();

let server: Server;

describe('FileSystemServer', () => {
  beforeEach(async () => {
    server = (
      await BunFileSystemServerAdapter.createServer({
        appConfig,
        options: {
          watchMode: false,
        },
      })
    ).server;
  });

  afterEach(() => {
    server.stop(true);
  });

  test('should create server', () => {
    expect(server).toBeDefined();
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
    expect(await res.text()).toContain('{"page":"1"}');
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
    expect(await res.text()).toContain('{"page":"1"}');
  });

  test('should return 200 for catch all page with params', async () => {
    const req = new Request(APP_TEST_ROUTES_URLS.catchAll);
    const res = await server.fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(await res.text()).toContain('{"path":["123","456"]}');
  });

  test('should return custom error template for non-existent page', async () => {
    const req = new Request(APP_TEST_ROUTES_URLS.nonExistentPage);
    const res = await server.fetch(req);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<h1>404 - Page Not Found</h1>');
  });
});
