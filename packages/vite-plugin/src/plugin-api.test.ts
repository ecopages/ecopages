import { describe, expect, it } from 'vitest';
import { createEcopagesPluginApi } from './plugin-api.ts';

function createApi() {
	return createEcopagesPluginApi({
		appConfig: {
			rootDir: '/app',
			baseUrl: 'http://localhost:3000',
			runtime: {},
			integrations: [],
			sourceTransforms: new Map(),
		} as never,
	});
}

describe('createEcopagesPluginApi', () => {
	it('resolves dev-host readiness once and ignores duplicate ready signals', async () => {
		const api = createApi();
		const ready = api.getDevHostReady();

		api.markDevHostReady();
		api.markDevHostReady();

		await expect(ready).resolves.toBeUndefined();
	});

	it('rejects dev-host readiness once and ignores later ready signals', async () => {
		const api = createApi();
		const ready = api.getDevHostReady();

		api.markDevHostFailed(new Error('warmup failed'));
		api.markDevHostReady();

		await expect(ready).rejects.toThrow('warmup failed');
	});

	it('tracks the warmed app cache across invalidation', () => {
		const api = createApi();
		const app = { fetch: async () => new Response('ok') };

		expect(api.getCachedApp()).toBeNull();

		api.setCachedApp(app);
		expect(api.getCachedApp()).toBe(app);

		api.invalidateAppCache();
		expect(api.getCachedApp()).toBeNull();
	});

	it('normalizes dev-server origins without a trailing slash', () => {
		const api = createApi();

		api.setDevServerOrigin('http://localhost:4012/');

		expect(api.getDevServerOrigin()).toBe('http://localhost:4012');
	});
});
