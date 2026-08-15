import { rewriteWikiLinkUrl } from '@/lib/obsidian/links';

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
 * Remark plugin that rewrites wiki `.md` cross-links to `/wiki/<slug>` at MDX compile time.
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
