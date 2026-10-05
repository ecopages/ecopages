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
	it('normalizes dev-server origins without a trailing slash', () => {
		const api = createApi();

		api.setDevServerOrigin('http://localhost:4012/');

		expect(api.getDevServerOrigin()).toBe('http://localhost:4012');
	});
});
