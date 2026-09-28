import { fromMarkdown } from 'mdast-util-from-markdown';
import { visit } from 'unist-util-visit';
import { WIKI_ROOT } from '../../content/wiki';
import { isOpaqueWikiLinkUrl, splitWikiLinkUrl } from './link-url-parts';

const WIKI_MARKDOWN_LINK_PATTERN = /\]\(((?:\.\/|\.\.\/)*[^)\s#]+?\.md(?:[?#][^)]*)?)\)/g;

function rewriteWikiPathname(pathname: string, currentCategory?: string): string | null {
	const absWikiMatch = pathname.match(/^(?:\.\/|\.\.\/)*(?:\/)?wiki\/(.+)$/);
	if (absWikiMatch) {
		const slug = absWikiMatch[1].replace(/\.md$/, '');
		return `${WIKI_ROOT}/${slug}`;
	}

	const relativeMatch = pathname.match(/^((?:\.\/|\.\.\/)*)([^/]+(?:\/[^/]+)*)\.md$/);
	if (!relativeMatch || !currentCategory) {
		return null;
	}

	const [, prefixes, relativePath] = relativeMatch;
	const upCount = (prefixes.match(/\.\.\//g) || []).length;

	if (upCount === 0) {
		return `${WIKI_ROOT}/${currentCategory}/${relativePath}`;
	}

	return `${WIKI_ROOT}/${relativePath}`;
}

/**
 * Resolves a wiki link target relative to the current category directory.
 *
 * @remarks
 * Ingest rewrites vault source with `currentCategory` so `./sibling.md` becomes
 * `/wiki/<category>/sibling`. Remark only sees those absolute URLs afterward.
 */
export function rewriteWikiLinkUrl(url: string, currentCategory?: string): string {
	if (isOpaqueWikiLinkUrl(url)) {
		return url;
	}

	const { pathname, query, hash } = splitWikiLinkUrl(url);
	const rewrittenPath = rewriteWikiPathname(pathname, currentCategory);
	if (!rewrittenPath) {
		return url;
	}

	return `${rewrittenPath}${query}${hash}`;
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

/**
 * Collects actual Markdown links, resolving reference definitions.
 * @remarks Code examples, images, and unused definitions do not form graph edges.
 */
export function extractWikiMarkdownLinkHrefs(body: string): string[] {
	const tree = fromMarkdown(body);
	const definitions = new Map<string, string>();
	visit(tree, 'definition', (node) => {
		if (!definitions.has(node.identifier)) {
			definitions.set(node.identifier, node.url);
		}
	});
	const hrefs: string[] = [];
	visit(tree, (node) => {
		if (node.type === 'link') {
			hrefs.push(node.url);
		} else if (node.type === 'linkReference') {
			const url = definitions.get(node.identifier);
			if (url !== undefined) {
				hrefs.push(url);
			}
		}
	});
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
