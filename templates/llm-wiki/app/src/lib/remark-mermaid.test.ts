import { fromMarkdown } from 'mdast-util-from-markdown';
import { expect, test } from 'vitest';
import { remarkMermaid } from './remark-mermaid';

type Node = { type: string; value?: string; children?: Node[] };

function transform(markdown: string, path = '/app/src/content/wiki/app/demo.md'): Node {
	const tree = fromMarkdown(markdown) as unknown as Node;
	remarkMermaid()(tree, { path });
	return tree;
}

function svgs(tree: Node): string[] {
	return (tree.children ?? [])
		.filter((node) => node.type === 'mdxJsxFlowElement')
		.map((node) => {
			const expression = node.children?.[0]?.value ?? '';
			return JSON.parse(expression.slice(expression.indexOf('(') + 1, -1)) as string;
		});
}

const flowchart = 'flowchart LR\n  A[Vault] --> B[Site]';
const titled = (title: string) => `flowchart LR\n  accTitle: ${title}\n  A[Vault] --> B[Site]`;
const sequence = 'sequenceDiagram\n  Agent->>Vault: write page';

test('renders flowchart and sequence blocks as inline svg', () => {
	const tree = transform(`# Title\n\n\`\`\`mermaid\n${flowchart}\n\`\`\`\n\n\`\`\`mermaid\n${sequence}\n\`\`\`\n`);
	const [first, second] = svgs(tree);

	expect(first).toContain('<svg');
	expect(first).toContain('pele-flowchart');
	expect(second).toContain('<svg');
	expect(second).toContain('pele-sequence');
	expect(tree.children?.some((node) => node.type === 'code')).toBe(false);
	expect(tree.children?.[0]?.type).toBe('mdxjsEsm');
});

test('leaves other code blocks and pages without diagrams untouched', () => {
	const tree = transform('```ts\nconst a = 1;\n```\n');

	expect(tree.children?.map((node) => node.type)).toEqual(['code']);
});

test('gives each diagram on a page a distinct, stable id prefix', () => {
	const markdown = `\`\`\`mermaid\n${titled('One')}\n\`\`\`\n\n\`\`\`mermaid\n${titled('Two')}\n\`\`\`\n`;
	const ids = svgs(transform(markdown)).map((svg) => svg.match(/id="([^"]*-title)"/)?.[1]);

	expect(ids).toEqual(['mermaid-app-demo-0-title', 'mermaid-app-demo-1-title']);
	expect(svgs(transform(markdown)).map((svg) => svg.match(/id="([^"]*-title)"/)?.[1])).toEqual(ids);
});

test('points at the code fence when the diagram type is not recognised', () => {
	expect(() => transform('text\n\n```mermaid\nnot a diagram\n```\n', '/wiki/app/broken.md')).toThrow(
		'/wiki/app/broken.md:3:0',
	);
});

test('names the file and the page position of an invalid diagram', () => {
	const markdown = '# Title\n\nSome text.\n\n```mermaid\nflowchart LR\nA --> B\nA --> ((\n```\n';

	expect(() => transform(markdown, '/wiki/app/broken.md')).toThrow('/wiki/app/broken.md:8:7');
});
