/**
 * Normalizes a URL pathname for matching and sitemap location building.
 *
 * @remarks
 * Ensures a leading slash and strips trailing slashes except for `/`.
 */
export function normalizePathname(pathname: string): string {
	if (!pathname || pathname === '/') {
		return '/';
	}

	const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`;
	return withLeadingSlash.replace(/\/+$/, '') || '/';
}

/**
 * Matches a pathname against a small set of supported patterns.
 *
 * @remarks
 * Supported forms:
 * - exact: `/admin`
 * - prefix wildcard: `/admin/**` (matches `/admin` and descendants)
 * - trailing `**` only as a full segment after `/`
 *
 * This is not a full glob engine. Unsupported patterns are treated as exact matches.
 */
export function matchPathPattern(pathname: string, pattern: string): boolean {
	const normalizedPath = normalizePathname(pathname);
	const normalizedPattern = pattern.trim();

	if (normalizedPattern.endsWith('/**')) {
		const prefix = normalizePathname(normalizedPattern.slice(0, -3));
		if (prefix === '/') {
			return true;
		}
		return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
	}

	return normalizedPath === normalizePathname(normalizedPattern);
}

/**
 * Returns true when the pathname matches any of the patterns.
 */
export function matchesAnyPathPattern(pathname: string, patterns: readonly string[]): boolean {
	return patterns.some((pattern) => matchPathPattern(pathname, pattern));
}
