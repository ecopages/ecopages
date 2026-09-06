import type { Element, Root } from 'hast';
import { transformerCopyButton } from '@rehype-pretty/transformers';
import rehypePrettyCode from 'rehype-pretty-code';
import { unified } from 'unified';
import { expect, test } from 'vitest';
import { rehypePrettyCopyCompatibility } from './rehype-pretty-copy-compatibility';

function run(tree: Root): Root {
	const plugin = rehypePrettyCopyCompatibility();
	plugin(tree);
	return tree;
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

test('pretty-code plus compatibility emit a data-rehype-pretty-copy button', async () => {
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
});
