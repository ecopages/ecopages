import { describe, expect, test } from 'vitest';
import { buildSitemapLocation, renderSitemap } from './sitemap.ts';

describe('buildSitemapLocation', () => {
	test('joins origin and pathname without trailing slash except root', () => {
		expect(buildSitemapLocation('https://example.com', '/')).toBe('https://example.com/');
		expect(buildSitemapLocation('https://example.com/', '/blog')).toBe('https://example.com/blog');
		expect(buildSitemapLocation('https://example.com', '/blog/')).toBe('https://example.com/blog');
	});

	test('passes through absolute http(s) URLs', () => {
		expect(buildSitemapLocation('https://example.com', 'https://cdn.example.com/rss.xml')).toBe(
			'https://cdn.example.com/rss.xml',
		);
	});
});

describe('renderSitemap', () => {
	test('renders an empty urlset', () => {
		expect(renderSitemap([])).toBe(
			[
				'<?xml version="1.0" encoding="UTF-8"?>',
				'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
				'',
				'</urlset>',
				'',
			].join('\n'),
		);
	});

	test('renders locations with XML escaping and deduplication', () => {
		const xml = renderSitemap(['https://example.com/a&b', 'https://example.com/blog/', 'https://example.com/blog']);

		expect(xml).toContain('<loc>https://example.com/a&amp;b</loc>');
		expect(xml).toContain('<loc>https://example.com/blog</loc>');
		expect(xml.match(/<url>/g)?.length).toBe(2);
	});

	test('preserves entry order of first occurrence', () => {
		const xml = renderSitemap(['https://example.com/', 'https://example.com/about']);
		const rootIndex = xml.indexOf('https://example.com/');
		const aboutIndex = xml.indexOf('https://example.com/about');
		expect(rootIndex).toBeLessThan(aboutIndex);
	});
});
