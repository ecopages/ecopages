import type { SitemapConfig } from '../types/public-types.ts';
import { matchesAnyPathPattern, normalizePathname } from '../utils/path-pattern.ts';
import { buildSitemapLocation } from './sitemap.ts';

/**
 * Builds the ordered absolute locations for sitemap.xml.
 *
 * @remarks
 * `eligiblePathnames` must already be successfully exported and robots-indexable.
 * Filtering here is only `sitemap.exclude`, then `extraUrls` are appended.
 * `extraUrls` always include (deduped) and are not subject to `exclude` or page robots.
 */
export function resolveSitemapLocations(input: {
	eligiblePathnames: readonly string[];
	sitemap: SitemapConfig;
	baseUrl: string;
}): string[] {
	const exclude = input.sitemap.exclude ?? [];
	const locations: string[] = [];
	const seen = new Set<string>();

	for (const pathname of input.eligiblePathnames) {
		const normalized = normalizePathname(pathname);
		if (matchesAnyPathPattern(normalized, exclude)) {
			continue;
		}

		const location = buildSitemapLocation(input.baseUrl, normalized);
		if (seen.has(location)) {
			continue;
		}
		seen.add(location);
		locations.push(location);
	}

	for (const extraUrl of input.sitemap.extraUrls ?? []) {
		const location = buildSitemapLocation(input.baseUrl, extraUrl);
		if (seen.has(location)) {
			continue;
		}
		seen.add(location);
		locations.push(location);
	}

	return locations;
}
