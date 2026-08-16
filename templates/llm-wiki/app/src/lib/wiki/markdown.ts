import { WIKI_ROOT } from '@/content/wiki';
import type { MarkdownTarget } from '@/lib/md-response';
import { getWikiRawContent } from './collection';

/**
 * Maps `/wiki/<category>/<slug>` and `/wiki/<category>/<slug>.md` to a wiki
 * slug. Returns `null` for non-wiki paths (including `/api/wiki/...`, which
 * the dedicated route owns).
 */
export function matchWikiMarkdownPath(pathname: string): MarkdownTarget | null {
	const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

	if (!normalized.startsWith(`${WIKI_ROOT}/`)) {
		return null;
	}

	const segment = normalized.slice(WIKI_ROOT.length + 1);
	if (!segment) {
		return null;
	}

	// Allow 1 or 2 segments: /wiki/<page> or /wiki/<category>/<page>
	const parts = segment.split('/');
	if (parts.length > 2) {
		return null;
	}

	if (segment.endsWith('.md')) {
		const slug = segment.slice(0, -3);
		if (!slug) {
			return null;
		}
		return { slug, forceMarkdown: true };
	}

	return { slug: segment, forceMarkdown: false };
}

/** Absolute path for the markdown alternate of a wiki HTML page. */
export function wikiMarkdownAlternatePath(slug: string): string {
	return `${WIKI_ROOT}/${slug}.md`;
}

/**
 * Returns the synced wiki markdown body for `slug`, or `null` when unknown.
 *
 * @remarks
 * Reads the mirrored collection under `src/content/wiki` (link-rewritten), not
 * the raw files in `wiki/`.
 */
export function getWikiMarkdown(slug: string): Promise<string | null> {
	return getWikiRawContent(slug);
}
