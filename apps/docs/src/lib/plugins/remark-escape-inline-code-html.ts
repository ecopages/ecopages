import type { Root } from 'mdast';

export function remarkEscapeInlineCodeHtml() {
	return function transformer(tree: Root): void {
		walk(tree as MdastNode);
	};
}

type MdastNode = {
	type: string;
	value?: string;
	children?: MdastNode[];
};

function walk(node: MdastNode): void {
	if (node.type === 'inlineCode' && typeof node.value === 'string') {
		node.value = node.value.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
		return;
	}

	if (!node.children) return;

	for (const child of node.children) {
		walk(child);
	}
}
