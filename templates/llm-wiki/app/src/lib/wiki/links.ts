import { WIKI_ROOT } from '../../content/wiki';

const WIKI_MARKDOWN_LINK_PATTERN = /\]\(((?:\.\/|\.\.\/)*[^)\s#]+?\.md(?:[?#][^)]*)?)\)/g;

/**
 * Resolves a wiki link target relative to the current category directory.
 *
 * @remarks
 * Ingest rewrites vault source with `currentCategory` so `./sibling.md` becomes
 * `/wiki/<category>/sibling`. Remark only sees those absolute URLs afterward.
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

	const absWikiMatch = pathname.match(/^(?:\.\/|\.\.\/)*(?:\/)?wiki\/(.+)$/);
	if (absWikiMatch) {
		const slug = absWikiMatch[1].replace(/\.md$/, '');
		return `${WIKI_ROOT}/${slug}${query}${hash}`;
	}

	const relativeMatch = pathname.match(/^((?:\.\/|\.\.\/)*)([^/]+(?:\/[^/]+)*)\.md$/);
	if (relativeMatch && currentCategory) {
		const [, prefixes, relativePath] = relativeMatch;
		const upCount = (prefixes.match(/\.\.\//g) || []).length;

		if (upCount === 0) {
			return `${WIKI_ROOT}/${currentCategory}/${relativePath}${query}${hash}`;
		}

		return `${WIKI_ROOT}/${relativePath}${query}${hash}`;
	}

	return url;
}

/** Wiki slug (`category/page`) for a markdown href, or `null` when it is not a wiki page link. */
export function resolveWikiLinkTarget(url: string, currentCategory?: string): string | null {
	const rewritten = rewriteWikiLinkUrl(url, currentCategory);
	if (!rewritten.startsWith(`${WIKI_ROOT}/`)) {
		return null;
	}
	const slug = rewritten.slice(WIKI_ROOT.length + 1).split(/[?#]/)[0];
	return slug || null;
}

/** Href targets of markdown links that point at `.md` files. */
export function extractWikiMarkdownLinkHrefs(body: string): string[] {
	const hrefs: string[] = [];
	const pattern = new RegExp(WIKI_MARKDOWN_LINK_PATTERN.source, 'g');
	for (const match of body.matchAll(pattern)) {
		if (match[1]) {
			hrefs.push(match[1]);
		}
	}
	return hrefs;
}

/**
 * Rewrites relative `.md` wiki cross-links to `/wiki/<category>/<slug>` URLs
 * for the web app.
 *
 * @remarks
 * Source pages in `wiki/<category>/` link by filename (`./another-entry.md`).
 * The site serves them at `/wiki/<category>/another-entry`. This is the
 * canonical rewrite; `remarkWikiLinks` only canonicalizes leftover
 * `/wiki/*.md` URLs at MDX compile time.
 */
export function rewriteWikiMarkdownLinks(body: string, currentCategory?: string): string {
	return body.replace(WIKI_MARKDOWN_LINK_PATTERN, (_match, url) => `](${rewriteWikiLinkUrl(url, currentCategory)})`);
}
