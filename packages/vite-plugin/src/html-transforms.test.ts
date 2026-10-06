import { describe, expect, it } from 'vitest';
import { ecopagesConfig } from './ecopages-config.ts';
import { createEcopagesPluginApi } from './plugin-api.ts';
import { normalizeHtmlResponse } from './html-transforms.ts';

function createConfigPlugin() {
	const appConfig = {
		rootDir: '/app',
		runtime: {},
		integrations: [],
		sourceTransforms: new Map(),
		absolutePaths: {
			pagesDir: '/app/src/pages',
			layoutsDir: '/app/src/layouts',
		},
	} as any;

	const api = createEcopagesPluginApi({
		appConfig,
		aliases: {
			'@ecopages/runtime': '/virtual/runtime.ts',
		},
		ssr: {
			noExternal: ['@ecopages/core'],
		},
	});

	return ecopagesConfig(api);
}

describe('normalizeHtmlResponse', () => {
	it('injects appended route html into the template slot marker', () => {
		const body = [
			'<!DOCTYPE html><html><head></head><body><--content--></body></html>',
			'<div class="shell"><main>Lit entry</main></div>',
		].join('');

		const normalized = normalizeHtmlResponse(body);

		expect(normalized).toContain('<body><div class="shell"><main>Lit entry</main></div></body>');
		expect(normalized).not.toContain('<--content-->');
		expect(normalized).not.toContain('</html><div class="shell">');
	});

	it('unwraps a root lit-part wrapper before injecting appended html', () => {
		const body = [
			'<!DOCTYPE html><html><head></head><body><--content--></body></html>',
			'<!--lit-part abc123--><div class="shell">Wrapped</div><!--/lit-part-->',
		].join('');

		const normalized = normalizeHtmlResponse(body);

		expect(normalized).toContain('<body><div class="shell">Wrapped</div></body>');
		expect(normalized).not.toContain('<!--lit-part abc123-->');
		expect(normalized).not.toContain('<--content-->');
	});
});

describe('ecopagesConfig', () => {
	it('turns Vite HMR off, also when the user config enables it', () => {
		const plugin = createConfigPlugin();

		expect((plugin.config as Function)({}).server.hmr).toBe(false);
		expect((plugin.config as Function)({ server: { hmr: { overlay: true } } }).server.hmr).toBe(false);
	});

	it('preserves array-form resolve.alias entries', () => {
		const plugin = createConfigPlugin();
		const result = (plugin.config as Function)({
			resolve: {
				alias: [{ find: '@', replacement: '/app/src' }],
			},
		});

		expect(result).toMatchObject({
			resolve: {
				alias: [
					{ find: '@ecopages/runtime', replacement: '/virtual/runtime.ts' },
					{ find: '@', replacement: '/app/src' },
				],
			},
		});
	});

	it('preserves ssr.noExternal=true when Ecopages adds package entries', () => {
		const plugin = createConfigPlugin();
		const result = (plugin.config as Function)({
			ssr: {
				noExternal: true,
			},
		});

		expect(result).toMatchObject({
			ssr: {
				noExternal: true,
			},
		});
	});

	it('merges string and RegExp ssr.noExternal entries without dropping either form', () => {
		const plugin = createConfigPlugin();
		const result = (plugin.config as Function)({
			ssr: {
				noExternal: [/^lit/, 'react'],
			},
		});

		expect(result?.ssr?.noExternal).toEqual([/^lit/, 'react', '@ecopages/core']);
	});

	it('syncs appConfig.baseUrl to the resolved Vite dev-server origin', () => {
		const appConfig = {
			rootDir: '/app',
			baseUrl: 'http://localhost:3000',
			runtime: {},
			integrations: [],
			sourceTransforms: new Map(),
			absolutePaths: {
				pagesDir: '/app/src/pages',
				layoutsDir: '/app/src/layouts',
			},
		} as any;
		const api = createEcopagesPluginApi({ appConfig });
		const plugin = ecopagesConfig(api);

		(plugin.configResolved as Function).call(
			{ name: 'ecopages:config' },
			{
				server: {
					host: 'localhost',
					port: 4012,
				},
			},
		);

		expect(api.getDevServerOrigin()).toBe('http://localhost:4012');
		expect(appConfig.baseUrl).toBe('http://localhost:4012');
	});
});
