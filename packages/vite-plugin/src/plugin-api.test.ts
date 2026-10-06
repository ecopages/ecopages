import { describe, expect, it } from 'vitest';
import { createVitePluginFromSourceTransform } from '@ecopages/core';
import { adaptSourceTransformToVitePlugin, createEcopagesPluginApi } from './plugin-api.ts';

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

describe('adaptSourceTransformToVitePlugin', () => {
	it('runs a transform for an id with a query, testing the filter without it', () => {
		const plugin = adaptSourceTransformToVitePlugin(
			createVitePluginFromSourceTransform({
				name: 'banner',
				filter: /\.tsx$/,
				transform: (code) => `/* banner */${code}`,
			}),
		);
		const hook = plugin.transform as
			| ((code: string, id: string) => unknown)
			| { filter?: { id?: RegExp }; handler: (code: string, id: string) => unknown };
		const runAsVite = (code: string, id: string): unknown => {
			if (typeof hook === 'function') return hook(code, id);
			if (hook.filter?.id && !hook.filter.id.test(id)) return undefined;
			return hook.handler(code, id);
		};

		expect(runAsVite('x', '/src/page.tsx?v=123')).toBe('/* banner */x');
		expect(runAsVite('x', '/src/page.ts')).toBeUndefined();
	});
});
