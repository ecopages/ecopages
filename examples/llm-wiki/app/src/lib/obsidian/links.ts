import { WIKI_ROOT } from '@/content/wiki';

const WIKI_MARKDOWN_LINK_PATTERN = /\]\(((?:\.\/|\.\.\/)*[^)\s#]+?\.md(?:[?#][^)]*)?)\)/g;

/**
 * Resolves a wiki link target relative to the current category directory.
 *
 * @remarks
 * - `./another-entry.md` -> `/wiki/<current-category>/another-entry`
 * - `../concept/auth.md` -> `/wiki/concept/auth`
 * - `/wiki/app/demo.md` -> `/wiki/app/demo`
 * - `wiki/app/demo.md` -> `/wiki/app/demo`
 */
export function rewriteWikiLinkUrl(url: string, currentCategory?: string): string {
	if (
		!url ||
		url.startsWith('http://') ||
		url.startsWith('https://') ||
		url.startsWith('mailto:') ||
		url.startsWith('tel:') ||
		url.startsWith('data:')
	) {
		return url;
	}

	const hashIndex = url.indexOf('#');
	const pathPart = hashIndex === -1 ? url : url.slice(0, hashIndex);
	const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
	const queryIndex = pathPart.indexOf('?');
	const pathname = queryIndex === -1 ? pathPart : pathPart.slice(0, queryIndex);
	const query = queryIndex === -1 ? '' : pathPart.slice(queryIndex);

	// Absolute wiki path: /wiki/app/demo or wiki/app/demo
	const absWikiMatch = pathname.match(/^(?:\.\/|\.\.\/)*(?:\/)?wiki\/(.+)$/);
	if (absWikiMatch) {
		const slug = absWikiMatch[1].replace(/\.md$/, '');
		return `${WIKI_ROOT}/${slug}${query}${hash}`;
	}

	// Already absolute path starting with /wiki/
	if (pathname.startsWith(`${WIKI_ROOT}/`)) {
		const slug = pathname.slice(WIKI_ROOT.length + 1).replace(/\.md$/, '');
		return `${WIKI_ROOT}/${slug}${query}${hash}`;
	}

	// Relative path: ./something.md or ../../category/something.md
	const relativeMatch = pathname.match(/^((?:\.\/|\.\.\/)*)([^/]+(?:\/[^/]+)*)\.md$/);
	if (relativeMatch && currentCategory) {
		const [, prefixes, relativePath] = relativeMatch;

		// Count how many ../ we have
		const upCount = (prefixes.match(/\.\.\//g) || []).length;

		if (upCount === 0) {
			// Same directory: ./another-entry.md -> /wiki/<category>/another-entry
			return `${WIKI_ROOT}/${currentCategory}/${relativePath}${query}${hash}`;
		}

		// Cross-directory: ../concept/auth.md -> /wiki/concept/auth
		// The relative path after stripping ../ is the target category/file
		const targetSlug = relativePath.replace(/\.md$/, '');
		return `${WIKI_ROOT}/${targetSlug}${query}${hash}`;
	}

	return url;
}

/**
 * Rewrites relative `.md` wiki cross-links to `/wiki/<category>/<slug>` URLs
 * for the web app.
 *
 * @remarks
 * Source pages in `wiki/<category>/` link by filename (`./another-entry.md`).
 * The site serves them at `/wiki/<category>/another-entry` — without this pass,
 * MDX would resolve links to the raw `.md` file.
 */
export function rewriteWikiMarkdownLinks(body: string, currentCategory?: string): string {
	return body.replace(WIKI_MARKDOWN_LINK_PATTERN, (_match, url) => `](${rewriteWikiLinkUrl(url, currentCategory)})`);
}
