import { describe, expect, test } from 'vitest';
import type { EcoBuildPluginBuilder } from '@ecopages/core/plugins/processor';
import {
	createContentPluginBundler,
	parseCollectionName,
	parseCollectionSpecifier,
	resolveCollectionPath,
} from '../content-plugins.ts';

describe('content-plugins', () => {
	test('parseCollectionName handles full and rolldown-split specifiers', () => {
		expect(parseCollectionName('ecopages:content/docs')).toBe('docs');
		expect(parseCollectionName('content/docs')).toBe('docs');
		expect(parseCollectionName('ecopages:content/blog-posts')).toBe('blog-posts');
		expect(parseCollectionName('ecopages:content/docs/server')).toBe('docs');
	});

	test('parseCollectionSpecifier distinguishes entries and server variants', () => {
		expect(parseCollectionSpecifier('ecopages:content/docs')).toEqual({
			collectionName: 'docs',
			variant: 'entries',
		});
		expect(parseCollectionSpecifier('ecopages:content/docs/server')).toEqual({
			collectionName: 'docs',
			variant: 'server',
		});
		expect(parseCollectionSpecifier('ecopages:content/docs/browser')).toEqual({
			collectionName: 'docs',
			variant: 'browser',
		});
	});

	test('resolveCollectionPath returns entries and server cache module paths', () => {
		const modules = {
			docs: '/tmp/.eco/cache/ecopages-content-processor/docs.ts',
		};
		const serverModules = {
			docs: '/tmp/.eco/cache/ecopages-content-processor/docs.server.ts',
		};
		const browserModules = {
			docs: '/tmp/.eco/cache/ecopages-content-processor/docs.browser.ts',
		};

		expect(resolveCollectionPath('ecopages:content/docs', modules, serverModules)).toBe(modules.docs);
		expect(resolveCollectionPath('ecopages:content/docs/server', modules, serverModules)).toBe(serverModules.docs);
		expect(
			resolveCollectionPath('ecopages:content/docs/browser', modules, serverModules, undefined, browserModules),
		).toBe(browserModules.docs);
		expect(resolveCollectionPath('content/docs', modules, serverModules)).toBe(modules.docs);
		expect(resolveCollectionPath('ecopages:content/missing', modules, serverModules)).toBeNull();
	});

	test('browser resolver returns generated files as filesystem paths so relative MDX imports resolve', async () => {
		const browserModules = {
			docs: '/tmp/.eco/cache/ecopages-content-processor/docs.browser.ts',
		};
		const plugin = createContentPluginBundler({}, {}, undefined, browserModules);
		const resolved: Array<{ path?: string; namespace?: string }> = [];

		await plugin.setup({
			onResolve(options, callback) {
				if (!options.filter.test('ecopages:content/docs/browser')) {
					return;
				}
				const result = callback({ path: 'ecopages:content/docs/browser' });
				if (result && typeof result === 'object' && 'then' in result) {
					throw new Error('expected a synchronous resolve result');
				}
				if (result) {
					resolved.push(result);
				}
			},
			onLoad() {},
			module() {},
			transform() {},
		} as EcoBuildPluginBuilder);

		expect(resolved).toContainEqual({ path: browserModules.docs });
		expect(resolved.some((result) => result.namespace === 'ecopages-content')).toBe(false);
	});
});
