import { describe, expect, test } from 'vitest';
import { collectHtmlCacheSourceDependencyPaths } from './html-page-cache-dependency-index.ts';
import { BuildInputDependencyIndex } from '../../build/cache/build-input-dependency-index.ts';

describe('HTML cache source paths', () => {
	test('the shared index resolves HTML cache keys for registered source paths', () => {
		const index = new BuildInputDependencyIndex();
		index.register({ consumer: 'html-cache', key: '/docs/intro' }, [
			'/app/pages/docs/[...slug].tsx',
			'/app/content/docs/intro.mdx',
		]);

		expect(index.resolveKeys('html-cache', '/app/content/docs/intro.mdx')).toEqual(['/docs/intro']);
		expect(index.resolveKeys('html-cache', '/app/pages/other.tsx')).toEqual([]);
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
