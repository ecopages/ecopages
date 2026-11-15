import type { Element, Root } from 'hast';
import { unified } from 'unified';
import { describe, expect, test } from 'vitest';
import { rehypePierreCode } from './rehype-pierre-code';

function fence(source: string, language?: string, meta?: string): Root {
	return {
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
						properties: language ? { className: [`language-${language}`] } : {},
						data: meta ? { meta } : undefined,
						children: [{ type: 'text', value: `${source}\n` }],
					},
				],
			},
		],
	};
}

async function run(tree: Root): Promise<Element> {
	const result = (await unified().use(rehypePierreCode).run(tree)) as Root;
	return result.children[0] as Element;
}

const elements = (node: Element) => node.children.filter((child): child is Element => child.type === 'element');
const text = (node: Element): string =>
	node.children
		.map((child) => (child.type === 'text' ? child.value : child.type === 'element' ? text(child) : ''))
		.join('');

describe('rehypePierreCode', () => {
	test('turns a fenced block into a figure with a pre of line spans and a copy button holding the exact source', async () => {
		const figure = await run(fence('const answer = 42;\nconsole.log(answer);', 'ts'));
		const [pre, button] = elements(figure);
		const code = elements(pre)[0];

		expect(figure.tagName).toBe('figure');
		expect(figure.properties).toHaveProperty('data-rehype-pretty-code-figure');
		expect(pre.properties?.tabIndex).toBe(0);
		expect(elements(code).filter((line) => line.properties?.['data-line'] === '')).toHaveLength(2);
		expect(text(code)).toBe('const answer = 42;\nconsole.log(answer);');
		expect(button).toMatchObject({
			tagName: 'button',
			properties: {
				type: 'button',
				title: 'Copy code',
				'aria-label': 'Copy code',
				'data-copy-button': '',
				'data-rehype-pretty-copy': 'const answer = 42;\nconsole.log(answer);',
			},
		});
		expect(elements(button).map((icon) => [icon.tagName, icon.properties?.['data-copy-icon']])).toEqual([
			['svg', 'copy'],
			['svg', 'check'],
		]);
		expect(text(button)).toBe('');
	});

	test('marks the figure for line numbers only when the fence meta asks for them', async () => {
		const numbered = await run(fence('a();\nb();', 'ts', 'showLineNumbers'));
		const plain = await run(fence('a();\nb();', 'ts'));
		const other = await run(fence('a();\nb();', 'ts', 'title="a.ts"'));

		expect(numbered.properties).toHaveProperty('data-line-numbers');
		expect(plain.properties).not.toHaveProperty('data-line-numbers');
		expect(other.properties).not.toHaveProperty('data-line-numbers');
	});

	test('puts the copy button beside the pre, not inside it, and copies the background variables onto the figure', async () => {
		const figure = await run(fence('a { color: red }', 'css'));
		const [pre] = elements(figure);

		expect(JSON.stringify(pre)).not.toContain('"tagName":"button"');
		expect(pre.properties?.style).toMatch(/--shiki-light-bg:/);
		expect(figure.properties?.style).toMatch(
			/--shiki-light-bg:[^;]+;--shiki-dark-bg:|--shiki-dark-bg:[^;]+;--shiki-light-bg:/,
		);
		expect(figure.properties?.style).not.toMatch(/--shiki-(light|dark):/);
	});

	test('colors tokens with the light and dark custom properties', async () => {
		const figure = await run(fence('const answer = 42;', 'ts'));

		expect(JSON.stringify(figure)).toMatch(
			/--shiki-light:#[0-9a-f]{6};--shiki-dark:#[0-9a-f]{6}|--shiki-dark:#[0-9a-f]{6};--shiki-light:#[0-9a-f]{6}/i,
		);
	});

	test('renders a block with an unknown language, or none, as plain text', async () => {
		const unknown = await run(fence('echo hi', 'definitely-not-a-language'));
		const none = await run(fence('echo hi'));

		expect(text(elements(elements(unknown)[0])[0])).toBe('echo hi');
		expect(text(elements(elements(none)[0])[0])).toBe('echo hi');
		expect(elements(unknown)[1].properties).toHaveProperty('data-rehype-pretty-copy', 'echo hi');
	});

	test('keeps html characters as text, for the serializer to escape', async () => {
		const figure = await run(fence('<div class="a">&</div>', 'html'));
		const [pre, button] = elements(figure);

		expect(text(elements(pre)[0])).toBe('<div class="a">&</div>');
		expect(button.properties).toHaveProperty('data-rehype-pretty-copy', '<div class="a">&</div>');
	});

	test('leaves a pre that is not a fenced code block alone', async () => {
		const tree: Root = {
			type: 'root',
			children: [{ type: 'element', tagName: 'pre', properties: {}, children: [{ type: 'text', value: 'raw' }] }],
		};

		expect((await run(tree)).tagName).toBe('pre');
	});

	test('highlights a fence inside an MDX JSX element', async () => {
		const [pre] = fence('const a = 1;', 'ts').children;
		const tree = {
			type: 'root',
			children: [{ type: 'mdxJsxFlowElement', name: 'Wrapper', attributes: [], children: [pre] }],
		} as unknown as Root;

		const result = (await unified().use(rehypePierreCode).run(tree)) as Root;
		const wrapper = result.children[0] as unknown as { children: Element[] };

		expect(wrapper.children[0].tagName).toBe('figure');
	});
});
