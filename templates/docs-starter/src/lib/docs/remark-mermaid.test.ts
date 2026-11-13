import { fromMarkdown } from 'mdast-util-from-markdown';
import { expect, test } from 'vitest';
import { remarkMermaid } from './remark-mermaid';

type Node = { type: string; value?: string; children?: Node[] };

function transform(markdown: string, path = '/app/src/pages/demo.mdx'): Node {
	const tree = fromMarkdown(markdown) as unknown as Node;
	remarkMermaid()(tree, { path });
	return tree;
}

test('replaces a mermaid fence with a diagram element and keeps other fences', () => {
	const tree = transform('```mermaid\nflowchart LR\n  A --> B\n```\n\n```ts\nconst a = 1;\n```\n');

	expect(tree.children?.map((node) => node.type)).toEqual(['mdxjsEsm', 'mdxJsxFlowElement', 'code']);
});

test('prefixes ids per diagram so two diagrams on a page do not collide', () => {
	const diagram = '```mermaid\nflowchart LR\n  accTitle: T\n  A --> B\n```\n\n';
	const tree = transform(diagram + diagram);
	const ids = (tree.children ?? [])
		.filter((node) => node.type === 'mdxJsxFlowElement')
		.map((node) => node.children?.[0]?.value?.match(/id=\\"([^"\\]*-title)\\"/)?.[1]);

	expect(ids).toEqual(['mermaid-pages-demo-0-title', 'mermaid-pages-demo-1-title']);
});

test('fails the build with the page file and line for an invalid diagram', () => {
	expect(() => transform('# Title\n\n```mermaid\nflowchart LR\n  A -->\n```\n')).toThrow(
		/Invalid Mermaid diagram at \/app\/src\/pages\/demo\.mdx:\d+:\d+/,
	);
});
