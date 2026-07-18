import { describe, expect, test } from 'vitest';
import { resolveSitemapLocations } from './sitemap-routes.ts';

describe('resolveSitemapLocations', () => {
	test('keeps eligible pathnames and appends extraUrls', () => {
		const locations = resolveSitemapLocations({
			baseUrl: 'https://example.com',
			eligiblePathnames: ['/', '/blog'],
			sitemap: { enabled: true, extraUrls: ['/rss.xml'] },
		});

		expect(locations).toEqual(['https://example.com/', 'https://example.com/blog', 'https://example.com/rss.xml']);
	});

	test('drops exclude matches and always includes extraUrls', () => {
		const locations = resolveSitemapLocations({
			baseUrl: 'https://example.com',
			eligiblePathnames: ['/', '/admin', '/admin/users', '/about'],
			sitemap: { enabled: true, exclude: ['/admin/**'], extraUrls: ['/admin/manifest.json'] },
		});

		expect(locations).toEqual([
			'https://example.com/',
			'https://example.com/about',
			'https://example.com/admin/manifest.json',
		]);
	});

	test('deduplicates overlapping eligible paths and extraUrls', () => {
		const locations = resolveSitemapLocations({
			baseUrl: 'https://example.com',
			eligiblePathnames: ['/feed'],
			sitemap: { enabled: true, extraUrls: ['/feed', '/rss.xml'] },
		});

		expect(locations).toEqual(['https://example.com/feed', 'https://example.com/rss.xml']);
	});
});
