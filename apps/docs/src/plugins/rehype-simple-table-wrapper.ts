import type { Element, Root } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

/**
 * Adds a wrapper div with overflow-x-auto to tables to enable horizontal scrolling on smaller screens.
 */
export const rehypeSimpleTableWrapper: Plugin<[], Root> = () => {
	return (tree) => {
		visit(tree, 'element', (node, index, parent) => {
			if (node.tagName !== 'table') {
				return;
			}

			if (
				parent &&
				parent.type === 'element' &&
				parent.tagName === 'div' &&
				Array.isArray(parent.properties?.className) &&
				(parent.properties.className as string[]).includes('table-wrapper')
			) {
				return;
			}

			if (!parent || typeof index !== 'number') {
				return;
			}

			const wrapper: Element = {
				type: 'element',
				tagName: 'div',
				properties: { className: ['overflow-x-auto', 'table-wrapper'] },
				children: [node],
			};

			parent.children[index] = wrapper;
		});
	};
};
