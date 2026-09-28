import { rewriteWikiLinkUrl } from './links';

function visitNodes(
	node: { type?: string; children?: unknown[]; url?: string },
	onLink: (link: { url?: string }) => void,
): void {
	if (node.type === 'link' || node.type === 'definition') {
		onLink(node);
	}

	if (!node.children) {
		return;
	}

	for (const child of node.children) {
		if (child && typeof child === 'object') {
			visitNodes(child as { type?: string; children?: unknown[]; url?: string }, onLink);
		}
	}
}

/**
 * Canonicalizes leftover `/wiki/*.md` URLs in generated MDX.
 *
 * @remarks
 * Relative vault links are rewritten at ingest via `rewriteWikiMarkdownLinks`.
 * This visitor does not receive the page category, so it cannot resolve `./sibling.md`.
 */
export function remarkWikiLinks() {
	return (tree: { type?: string; children?: unknown[]; url?: string }) => {
		visitNodes(tree, (link) => {
			if (link.url) {
				link.url = rewriteWikiLinkUrl(link.url);
			}
		});
	};
}
