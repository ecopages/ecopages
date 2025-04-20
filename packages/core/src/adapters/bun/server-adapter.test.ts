import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { FIXTURE_APP_BASE_URL, FIXTURE_APP_PROJECT_DIR } from '../../../fixtures/constants.ts';
import { ConfigBuilder } from '../../config/config-builder.ts';
import { createBunServerAdapter } from './server-adapter.ts';

const appConfig = await new ConfigBuilder()
  .setRootDir(FIXTURE_APP_PROJECT_DIR)
  .setBaseUrl(FIXTURE_APP_BASE_URL)
  .build();

let server: Server;

describe('BunServerAdapter', () => {
  beforeAll(async () => {
    const adapter = await createBunServerAdapter({
      appConfig,
      options: { watch: false },
      serveOptions: {
        port: 3001,
        hostname: 'localhost',
      },
      apiHandlers: [
        {
          path: '/api/test',
          method: 'GET',
          handler: async () => new Response('Hello World'),
        },
        {
          path: '/api/:id',
          method: 'GET',
          handler: async ({ request }) => {
            const { id } = request.params;
            return new Response(id);
          },
        },
        {
          path: '/api/error',
          method: 'GET',
          handler: async () => {
            throw new Error('Test error');
          },
        },
        {
          path: '/api/post-test',
          method: 'POST',
          handler: async ({ request }) => {
            const body = await request.json();
            return new Response(JSON.stringify(body));
          },
        },
        {
          path: '/api/*',
          method: 'GET',
          handler: async () => new Response('Catch all'),
        },
      ],
    });

    server = Bun.serve(adapter.getServerOptions());
    await adapter.completeInitialization(server);
  });

  afterAll(() => {
    server.stop(true);
  });

  test('server should be created and running', () => {
    expect(server).toBeDefined();
    expect(server.port).toBe(3001);
    expect(server.hostname).toBe('localhost');
  });

  test('GET /api/test should return Hello World', async () => {
    const res = await fetch('http://localhost:3001/api/test');

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Hello World');
  });

  test('GET /api/:id should return the id parameter', async () => {
    const res = await fetch('http://localhost:3001/api/123');

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('123');
  });

  test('GET /api/* should handle catch-all routes', async () => {
    const res = await fetch('http://localhost:3001/api/hola-here/bye-bye');

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Catch all');
  });

  test('GET /api/error should handle errors gracefully', async () => {
    const res = await fetch('http://localhost:3001/api/error');

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal Server Error' });
  });

  test('POST /api/post-test should handle JSON body', async () => {
    const testData = { message: 'Hello' };
    const res = await fetch(
      new Request('http://localhost:3001/api/post-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(testData);
  });

  test('should handle multiple concurrent requests', async () => {
    const requests = Array(5)
      .fill(null)
      .map(() => fetch('http://localhost:3001/api/test'));

    const responses = await Promise.all(requests);

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Hello World');
    }
  });
});
