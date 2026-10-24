import { describe, expect, test } from 'vitest';
import type { EcoBuildPluginBuilder } from '@ecopages/core/processor';
import {
	createContentPlugin,
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

	test('parseCollectionSpecifier distinguishes entries, server and component variants', () => {
		expect(parseCollectionSpecifier('ecopages:content/docs')).toEqual({
			collectionName: 'docs',
			variant: 'entries',
		});
		expect(parseCollectionSpecifier('ecopages:content/docs/server')).toEqual({
			collectionName: 'docs',
			variant: 'server',
		});
		expect(parseCollectionSpecifier('ecopages:content/docs/component')).toEqual({
			collectionName: 'docs',
			variant: 'component',
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
			resolveCollectionPath('ecopages:content/docs/component', modules, serverModules, undefined, browserModules),
		).toBe(serverModules.docs);
		expect(
			resolveCollectionPath(
				'ecopages:content/docs/component',
				modules,
				serverModules,
				undefined,
				browserModules,
				'browser',
			),
		).toBe(browserModules.docs);
		expect(resolveCollectionPath('content/docs', modules, serverModules)).toBe(modules.docs);
		expect(resolveCollectionPath('ecopages:content/missing', modules, serverModules)).toBeNull();
	});

	test('server resolver backs /component with the externalized compiled server module', async () => {
		const serverModules = { docs: '/tmp/cache/docs.server.ts' };
		const compiledModules = { docs: '/tmp/server-collections/docs.mjs' };
		const ensured: string[] = [];
		const plugin = createContentPlugin({}, serverModules, compiledModules, async (name) => {
			ensured.push(name);
		});
		const resolved: Array<{ path?: string; external?: boolean }> = [];
		const pending: Array<Promise<void>> = [];

		await plugin.setup({
			onResolve(options, callback) {
				if (!options.filter.test('ecopages:content/docs/component')) {
					return;
				}
				pending.push(
					Promise.resolve(callback({ path: 'ecopages:content/docs/component' })).then((result) => {
						if (result) {
							resolved.push(result);
						}
					}),
				);
			},
			onLoad() {},
			module() {},
			transform() {},
		} as EcoBuildPluginBuilder);
		await Promise.all(pending);

		expect(resolved).toEqual([{ path: compiledModules.docs, external: true }]);
		expect(ensured).toEqual(['docs']);
	});

	test('browser resolver does not resolve /server', async () => {
		const plugin = createContentPluginBundler({}, { docs: '/tmp/cache/docs.server.ts' });
		const matched: string[] = [];

		await plugin.setup({
			onResolve(options) {
				if (options.filter.test('ecopages:content/docs/server')) {
					matched.push('server');
				}
			},
			onLoad() {},
			module() {},
			transform() {},
		} as EcoBuildPluginBuilder);

		expect(matched).toEqual([]);
	});

	test('browser resolver returns generated files as filesystem paths so relative MDX imports resolve', async () => {
		const browserModules = {
			docs: '/tmp/.eco/cache/ecopages-content-processor/docs.browser.ts',
		};
		const plugin = createContentPluginBundler({}, {}, undefined, browserModules);
		const resolved: Array<{ path?: string; namespace?: string }> = [];
		const pending: Array<Promise<void>> = [];

		await plugin.setup({
			onResolve(options, callback) {
				if (!options.filter.test('ecopages:content/docs/component')) {
					return;
				}
				pending.push(
					Promise.resolve(callback({ path: 'ecopages:content/docs/component' })).then((result) => {
						if (result) {
							resolved.push(result);
						}
					}),
				);
			},
			onLoad() {},
			module() {},
			transform() {},
		} as EcoBuildPluginBuilder);
		await Promise.all(pending);

		expect(resolved).toContainEqual({ path: browserModules.docs });
		expect(resolved.some((result) => result.namespace === 'ecopages-content')).toBe(false);
	});
});
