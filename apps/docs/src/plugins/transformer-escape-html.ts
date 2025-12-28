import type { ShikiTransformer } from 'shiki';
import type { Element } from 'hast';
import Html from '@kitajs/html';

/**
 * Custom Shiki transformer that escapes HTML entities in code block content.
 * Uses @kitajs/html's escape function for consistent escaping that won't
 * be undone by the MDX pipeline.
 */
export const transformerEscapeHtml: ShikiTransformer = {
	name: 'escape-html',
	// Run after other transformers to escape the final content
	enforce: 'post',
	span(node) {
		// Escape HTML entities in text nodes within spans
		escapeChildTextNodes(node);
	},
};

/**
 * Recursively escapes HTML entities in text nodes
 */
function escapeChildTextNodes(node: Element): void {
	if (!node.children) return;

	for (let i = 0; i < node.children.length; i++) {
		const child = node.children[i];
		if (child.type === 'text' && typeof child.value === 'string') {
			child.value = Html.escapeHtml(child.value);
		} else if (child.type === 'element') {
			escapeChildTextNodes(child);
		}
	}
}
