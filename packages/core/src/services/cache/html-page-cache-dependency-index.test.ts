import { describe, expect, test } from 'vitest';
import {
	HtmlPageCacheDependencyIndex,
	collectHtmlCacheSourceDependencyPaths,
} from './html-page-cache-dependency-index.ts';

describe('HtmlPageCacheDependencyIndex', () => {
	test('resolves cache keys for registered source paths', () => {
		const index = new HtmlPageCacheDependencyIndex();
		index.register('/docs/intro', ['/app/pages/docs/[...slug].tsx', '/app/content/docs/intro.mdx']);

		expect(index.resolveCacheKeysForSourcePaths(['/app/content/docs/intro.mdx'])).toEqual(['/docs/intro']);
		expect(index.resolveCacheKeysForSourcePaths(['/app/pages/other.tsx'])).toEqual([]);
	});

	test('replaces dependency metadata when the same cache key is registered again', () => {
		const index = new HtmlPageCacheDependencyIndex();
		index.register('/docs/intro', ['/app/content/docs/intro.mdx']);
		index.register('/docs/intro', ['/app/content/docs/updated.mdx']);

		expect(index.resolveCacheKeysForSourcePaths(['/app/content/docs/intro.mdx'])).toEqual([]);
		expect(index.resolveCacheKeysForSourcePaths(['/app/content/docs/updated.mdx'])).toEqual(['/docs/intro']);
	});

	test('collectHtmlCacheSourceDependencyPaths merges route, graph, and asset paths', () => {
		const paths = collectHtmlCacheSourceDependencyPaths({
			routeFile: '/app/pages/docs/[...slug].tsx',
			graphDependencyPaths: new Set(['/app/content/docs/intro.mdx']),
			processedAssets: [{ sourceFilepath: '/app/src/components/Button.tsx' }],
		});

		expect(paths).toEqual(
			expect.arrayContaining([
				'/app/pages/docs/[...slug].tsx',
				'/app/content/docs/intro.mdx',
				'/app/src/components/Button.tsx',
			]),
		);
		expect(paths).toHaveLength(3);
	});
});
