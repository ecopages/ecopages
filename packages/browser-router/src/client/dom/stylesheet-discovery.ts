/**
 * Shared stylesheet href discovery for navigation prefetch and commit.
 * @module
 */

/**
 * Returns resolved stylesheet hrefs currently in the document head.
 */
export function getCurrentStylesheetHrefs(): Set<string> {
	return new Set(
		Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((link) => link.href),
	);
}

/**
 * Returns stylesheet links present in `source` but not in `existingHrefs`.
 */
export function discoverNewStylesheetLinks(
	source: Document,
	existingHrefs: Set<string> = getCurrentStylesheetHrefs(),
): HTMLLinkElement[] {
	const discovered: HTMLLinkElement[] = [];

	for (const link of source.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
		if (existingHrefs.has(link.href)) {
			continue;
		}

		existingHrefs.add(link.href);
		discovered.push(link);
	}

	return discovered;
}
