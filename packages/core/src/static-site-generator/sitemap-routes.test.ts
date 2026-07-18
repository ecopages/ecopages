import { describe, expect, test, vi } from 'vitest';
import { resolveSitemapPathnames } from './sitemap-routes.ts';

describe('resolveSitemapPathnames', () => {
	test('keeps only active pathnames and appends extraUrls', async () => {
		const locations = await resolveSitemapPathnames({
			baseUrl: 'https://example.com',
			activeStaticPathnames: new Set(['/', '/blog']),
			candidates: [
				{ pathname: '/', params: {} },
				{ pathname: '/blog', params: {} },
				{ pathname: '/draft', params: {} },
			],
			sitemap: { enabled: true, extraUrls: ['/rss.xml'] },
			resolveMetadata: async () => undefined,
		});

		expect(locations).toEqual(['https://example.com/', 'https://example.com/blog', 'https://example.com/rss.xml']);
	});

	test('drops exclude matches and noindex pages', async () => {
		const resolveMetadata = vi.fn(async ({ pathname }: { pathname: string }) => {
			if (pathname === '/secret') {
				return { robots: { index: false } };
			}
			return undefined;
		});

		const locations = await resolveSitemapPathnames({
			baseUrl: 'https://example.com',
			activeStaticPathnames: new Set(['/', '/admin', '/admin/users', '/secret', '/about']),
			candidates: [
				{ pathname: '/', params: {}, filePath: '/pages/index.tsx' },
				{ pathname: '/admin', params: {}, filePath: '/pages/admin.tsx' },
				{ pathname: '/admin/users', params: {}, filePath: '/pages/admin/users.tsx' },
				{ pathname: '/secret', params: {}, filePath: '/pages/secret.tsx' },
				{ pathname: '/about', params: {}, filePath: '/pages/about.tsx' },
			],
			sitemap: { enabled: true, exclude: ['/admin/**'] },
			resolveMetadata,
		});

		expect(locations).toEqual(['https://example.com/', 'https://example.com/about']);
		expect(resolveMetadata).toHaveBeenCalled();
	});

	test('deduplicates overlapping candidates and extraUrls', async () => {
		const locations = await resolveSitemapPathnames({
			baseUrl: 'https://example.com',
			activeStaticPathnames: new Set(['/feed']),
			candidates: [{ pathname: '/feed', params: {} }],
			sitemap: { enabled: true, extraUrls: ['/feed', '/rss.xml'] },
			resolveMetadata: async () => undefined,
		});

		expect(locations).toEqual(['https://example.com/feed', 'https://example.com/rss.xml']);
	});
});
