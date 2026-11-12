import type { Element, Root } from 'hast';
import { transformerCopyButton } from '@rehype-pretty/transformers';
import rehypePrettyCode from 'rehype-pretty-code';
import { unified } from 'unified';
import { expect, test } from 'vitest';
import { rehypePrettyCopyCompatibility } from './rehype-pretty-copy-compatibility';

function run(tree: Root): Root {
	return unified().use(rehypePrettyCopyCompatibility).runSync(tree);
}

function findElement(node: Root | Element, match: (element: Element) => boolean): Element | undefined {
	if (node.type === 'element' && match(node)) {
		return node;
	}

	for (const child of node.children) {
		if (child.type !== 'element') {
			continue;
		}
		const found = findElement(child, match);
		if (found) {
			return found;
		}
	}

	return undefined;
}

function copyButton(properties: Element['properties']): Element {
	return {
		type: 'element',
		tagName: 'button',
		properties: {
			type: 'button',
			title: 'Copy code',
			'aria-label': 'Copy code',
			...properties,
		},
		children: [
			{
				type: 'element',
				tagName: 'span',
				properties: { class: 'ready' },
				children: [],
			},
		],
	};
}

test('rewrites transformer copy buttons for the MDX JSX renderer', () => {
	const tree: Root = {
		type: 'root',
		children: [
			{
				type: 'element',
				tagName: 'code',
				properties: {},
				children: [
					copyButton({
						data: 'console.log(1)',
						class: 'rehype-pretty-copy',
						onclick: 'navigator.clipboard.writeText(this.attributes.data.value)',
					}),
					{
						type: 'element',
						tagName: 'style',
						properties: {},
						children: [{ type: 'text', value: 'pre button.rehype-pretty-copy { opacity: 0; }' }],
					},
				],
			},
		],
	};

	const [code] = run(tree).children as Element[];
	expect(code?.children).toHaveLength(1);

	const [button] = code.children as Element[];
	expect(button.tagName).toBe('button');
	expect(button.properties).toEqual({
		type: 'button',
		title: 'Copy code',
		'aria-label': 'Copy code',
		'data-rehype-pretty-copy': 'console.log(1)',
	});
	expect(button.children).toEqual([{ type: 'text', value: 'Copy' }]);
});

test('accepts className arrays and onClick from the hast tree', () => {
	const tree: Root = {
		type: 'root',
		children: [
			copyButton({
				data: 'export {}',
				className: ['rehype-pretty-copy'],
				onClick: 'navigator.clipboard.writeText(this.attributes.data.value)',
			}),
		],
	};

	const [button] = run(tree).children as Element[];
	expect(button.properties).toEqual({
		type: 'button',
		title: 'Copy code',
		'aria-label': 'Copy code',
		'data-rehype-pretty-copy': 'export {}',
	});
});

test('moves the copy button onto the figure so it is not inside the scrolling pre', () => {
	const tree: Root = {
		type: 'root',
		children: [
			{
				type: 'element',
				tagName: 'figure',
				properties: { 'data-rehype-pretty-code-figure': '' },
				children: [
					{
						type: 'element',
						tagName: 'pre',
						properties: { style: '--shiki-light-bg: #fff; --shiki-dark-bg: #111' },
						children: [
							{
								type: 'element',
								tagName: 'code',
								properties: {},
								children: [
									{
										type: 'element',
										tagName: 'span',
										properties: { class: 'line' },
										children: [{ type: 'text', value: 'export {}' }],
									},
									copyButton({
										data: 'export {}',
										class: 'rehype-pretty-copy',
									}),
								],
							},
						],
					},
				],
			},
		],
	};

	const [figure] = run(tree).children as Element[];
	expect(figure?.tagName).toBe('figure');
	expect(figure.children.map((child) => (child.type === 'element' ? child.tagName : child.type))).toEqual([
		'pre',
		'button',
	]);

	const [pre, button] = figure.children as Element[];
	expect(pre.tagName).toBe('pre');
	expect(JSON.stringify(pre)).not.toContain('"tagName":"button"');
	expect(button.properties).toEqual({
		type: 'button',
		title: 'Copy code',
		'aria-label': 'Copy code',
		'data-rehype-pretty-copy': 'export {}',
	});
	expect(String(figure.properties?.style)).toContain('--shiki-light-bg: #fff');
	expect(String(figure.properties?.style)).toContain('--shiki-dark-bg: #111');
});

test('pretty-code places the copy button outside pre and before the caption', async () => {
	const tree: Root = {
		type: 'root',
		children: [
			{
				type: 'element',
				tagName: 'pre',
				properties: {},
				children: [
					{
						type: 'element',
						tagName: 'code',
						properties: { className: ['language-js'] },
						data: { meta: 'caption="Example output"' },
						children: [{ type: 'text', value: 'console.log(1)' }],
					},
				],
			},
		],
	};

	const result = (await unified()
		.use(rehypePrettyCode, {
			theme: {
				light: 'light-plus',
				dark: 'dark-plus',
			},
			transformers: [transformerCopyButton()],
		})
		.use(rehypePrettyCopyCompatibility)
		.run(tree)) as Root;

	const html = JSON.stringify(result);
	expect(html).toContain('"data-rehype-pretty-copy":"console.log(1)"');
	expect(html).toContain('"value":"Copy"');
	expect(html).not.toMatch(/"class":"rehype-pretty-copy"/);
	expect(html).not.toContain('"tagName":"style"');

	const figure = findElement(result, (node) => node.tagName === 'figure');
	expect(figure).toBeDefined();
	const tags = figure?.children
		.filter((child): child is Element => child.type === 'element')
		.map((child) => child.tagName);
	expect(tags).toEqual(['pre', 'button', 'figcaption']);
	const pre = figure?.children.find((child): child is Element => child.type === 'element' && child.tagName === 'pre');
	expect(JSON.stringify(pre)).not.toContain('"tagName":"button"');
	expect(String(figure?.properties?.style)).toContain('--shiki-light-bg');
});
