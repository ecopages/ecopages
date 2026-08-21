import { describe, expect, test } from 'vitest';
import { parseCollectionName, parseCollectionSpecifier, resolveCollectionPath } from '../content-plugins.ts';

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
});
