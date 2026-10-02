import type { Element, ElementContent, Root } from 'hast';
import { unified } from 'unified';
import { expect, test } from 'vitest';
import { rehypeHeadingIds, slugifyHeadingText } from './rehype-heading-ids';

function heading(tagName: string, children: ElementContent[], id?: string): Element {
	return { type: 'element', tagName, properties: id ? { id } : {}, children };
}

function text(value: string): ElementContent {
	return { type: 'text', value };
}

function idsOf(tree: Root): Array<string | undefined> {
	return tree.children.map((node) =>
		node.type === 'element' ? (node.properties?.id as string | undefined) : undefined,
	);
}

test('slugifies like the TOC: lowercase, hyphenated, punctuation dropped', () => {
	expect(slugifyHeadingText('  Stylesheets, scripts, and other assets ')).toBe(
		'stylesheets-scripts-and-other-assets',
	);
	expect(slugifyHeadingText('html.tsx')).toBe('htmltsx');
});

test('ids section headings from their text, including inline code, and dedupes repeats', () => {
	const tree: Root = {
		type: 'root',
		children: [
			heading('h1', [text('Page title')]),
			heading('h2', [text('HTML Pages')]),
			heading('h3', [{ type: 'element', tagName: 'code', properties: {}, children: [text('html.tsx')] }]),
			heading('h3', [text('Examples')]),
			heading('h3', [text('Examples')]),
			heading('h2', [text('Kept')], 'custom-id'),
			heading('h2', [text('custom id')]),
		],
	};

	const result = unified().use(rehypeHeadingIds).runSync(tree);

	expect(idsOf(result)).toEqual([
		undefined,
		'html-pages',
		'htmltsx',
		'examples',
		'examples-2',
		'custom-id',
		'custom-id-2',
	]);
});
