import { escapeXmlText } from '../utils/html-escaping.ts';
import { normalizePathname } from '../utils/path-pattern.ts';

/**
 * Joins a base origin with a pathname or absolute URL into a sitemap `<loc>` value.
 *
 * @remarks
 * Trailing slashes are stripped except for the site root (`/`). Absolute `http(s)`
 * URLs in `extraUrls` are returned as-is (still slash-normalized).
 */
export function buildSitemapLocation(baseUrl: string, pathnameOrUrl: string): string {
	const trimmed = pathnameOrUrl.trim();
	if (/^https?:\/\//i.test(trimmed)) {
		return normalizeLocation(trimmed);
	}

	const origin = baseUrl.replace(/\/+$/, '');
	const pathname = normalizePathname(trimmed);
	return pathname === '/' ? `${origin}/` : `${origin}${pathname}`;
}

/**
 * Renders a sitemap.org 0.9 urlset document from absolute location URLs.
 *
 * @remarks
 * Callers are responsible for deduplication; this serializer preserves input order.
 */
export function renderSitemap(locations: readonly string[]): string {
	const urls = locations
		.map((loc) => `  <url>\n    <loc>${escapeXmlText(normalizeLocation(loc))}</loc>\n  </url>`)
		.join('\n');

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		urls,
		'</urlset>',
		'',
	].join('\n');
}

function normalizeLocation(location: string): string {
	if (/^https?:\/\/[^/]+\/?$/i.test(location)) {
		return `${location.replace(/\/+$/, '')}/`;
	}

	return location.replace(/\/+$/, '');
}
