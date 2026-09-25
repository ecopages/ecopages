import { afterEach, describe, expect, it } from 'vitest';
import { createMdxTransformCacheKey, resetMdxTransformCacheForTests } from '../core/mdx-transform-cache.ts';

function remarkPluginAlpha() {
	return () => undefined;
}

function remarkPluginBeta() {
	return () => null;
}

describe('createMdxTransformCacheKey', () => {
	afterEach(() => {
		resetMdxTransformCacheForTests();
	});

	it('distinguishes same-length compiler plugin lists', () => {
		const source = '# Hello\n';
		const filePath = '/tmp/page.mdx';

		const withAlpha = createMdxTransformCacheKey(filePath, source, {
			remarkPlugins: [remarkPluginAlpha],
		});
		const withBeta = createMdxTransformCacheKey(filePath, source, {
			remarkPlugins: [remarkPluginBeta],
		});

		expect(withAlpha).not.toBe(withBeta);
	});

	it('is stable for the same plugin functions and source', () => {
		const source = '# Hello\n';
		const filePath = '/tmp/page.mdx';
		const compilerOptions = { remarkPlugins: [remarkPluginAlpha] };

		expect(createMdxTransformCacheKey(filePath, source, compilerOptions)).toBe(
			createMdxTransformCacheKey(filePath, source, compilerOptions),
		);
	});

	it('distinguishes factory plugins that capture different values', () => {
		function createRemarkPlugin(enabled: boolean) {
			return function remarkPlugin() {
				return () => enabled;
			};
		}

		const source = '# Hello\n';
		const filePath = '/tmp/page.mdx';
		const withEnabled = createMdxTransformCacheKey(filePath, source, {
			remarkPlugins: [createRemarkPlugin(true)],
		});
		const withDisabled = createMdxTransformCacheKey(filePath, source, {
			remarkPlugins: [createRemarkPlugin(false)],
		});

		expect(createRemarkPlugin(true).toString()).toBe(createRemarkPlugin(false).toString());
		expect(withEnabled).not.toBe(withDisabled);
	});
});
