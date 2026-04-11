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

	it('injects Vite client script when injectViteClient is true', () => {
		const body = '<!DOCTYPE html><html><head></head><body></body></html>';
		const normalized = normalizeHtmlResponse(body, { injectViteClient: true });

		expect(normalized).toContain('<script type="module" src="/@vite/client"></script></head>');
	});

	it('does not inject a duplicate Vite client script when one is already present', () => {
		const body = [
			'<!DOCTYPE html><html><head>',
			'<script type="module" src="/@vite/client"></script>',
			'</head><body></body></html>',
		].join('');
		const normalized = normalizeHtmlResponse(body, { injectViteClient: true });

		expect(normalized.match(/\/@vite\/client/g)).toHaveLength(1);
	});

	it('does not inject Vite client script by default', () => {
		const body = '<!DOCTYPE html><html><head></head><body></body></html>';
		const normalized = normalizeHtmlResponse(body);

		expect(normalized).not.toContain('/@vite/client');
	});
});

describe('ecopagesConfig', () => {
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
});
