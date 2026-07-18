import type { PageMetadataProps, SitemapConfig } from '../types/public-types.ts';
import { matchesAnyPathPattern, normalizePathname } from '../utils/path-pattern.ts';
import { buildSitemapLocation } from './sitemap.ts';

/**
 * A route candidate considered for sitemap inclusion.
 */
export type SitemapRouteCandidate = {
	pathname: string;
	params: Record<string, string>;
	/** Filesystem page path when metadata can be resolved via the page module loader. */
	filePath?: string;
};

export type ResolveSitemapMetadata = (input: {
	pathname: string;
	params: Record<string, string>;
	filePath?: string;
}) => Promise<Pick<PageMetadataProps, 'robots'> | undefined>;

/**
 * Filters static-export pathnames into the ordered list that should appear in sitemap.xml.
 *
 * @remarks
 * Precedence (all must pass before a page URL is listed):
 * 1. Pathname is in `activeStaticPathnames` (successfully exported)
 * 2. Pathname does not match any `sitemap.exclude` pattern
 * 3. Resolved `metadata.robots?.index !== false`
 *
 * `extraUrls` are always appended after page URLs and are not subject to page metadata.
 */
export async function resolveSitemapPathnames(input: {
	candidates: readonly SitemapRouteCandidate[];
	activeStaticPathnames: ReadonlySet<string>;
	sitemap: SitemapConfig;
	baseUrl: string;
	resolveMetadata: ResolveSitemapMetadata;
}): Promise<string[]> {
	const exclude = input.sitemap.exclude ?? [];
	const locations: string[] = [];
	const seen = new Set<string>();

	for (const candidate of input.candidates) {
		const pathname = normalizePathname(candidate.pathname);
		if (!input.activeStaticPathnames.has(pathname) && !input.activeStaticPathnames.has(candidate.pathname)) {
			continue;
		}

		if (matchesAnyPathPattern(pathname, exclude)) {
			continue;
		}

		const metadata = await input.resolveMetadata({
			pathname,
			params: candidate.params,
			filePath: candidate.filePath,
		});

		if (metadata?.robots?.index === false) {
			continue;
		}

		const location = buildSitemapLocation(input.baseUrl, pathname);
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
