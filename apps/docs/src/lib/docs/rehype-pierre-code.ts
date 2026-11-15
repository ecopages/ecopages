import type { Element, ElementContent, Root, RootContent } from 'hast';
import type { Plugin } from 'unified';
import { COPY_ICON_ATTRIBUTES, COPY_ICON_SHAPES } from './copy-icons';
import { highlightCode, tokenStyle } from './pierre-highlight';

const LANGUAGE_CLASS = /^language-(.+)$/;
const BACKGROUND_VARIABLE = /^--shiki-(light|dark)-bg:/;
const SHOW_LINE_NUMBERS = /(^|\s)showLineNumbers(\s|$)/;

function isElement(node: Root | RootContent | ElementContent): node is Element {
	return node.type === 'element';
}

function classNames(element: Element): string[] {
	const value = element.properties?.className;
	return Array.isArray(value) ? value.map(String) : [];
}

function textOf(node: Element | ElementContent): string {
	if (node.type === 'text') {
		return node.value;
	}
	return node.type === 'element' ? node.children.map(textOf).join('') : '';
}

function codeOf(pre: Element): Element | undefined {
	const [only] = pre.children.filter(isElement);
	return only?.tagName === 'code' ? only : undefined;
}

const CAMEL_CASE_ATTRIBUTE: Record<string, string> = {
	'stroke-width': 'strokeWidth',
	'stroke-linecap': 'strokeLinecap',
	'stroke-linejoin': 'strokeLinejoin',
};

function svgElement(tagName: string, properties: Element['properties'], children: Element[] = []): Element {
	return { type: 'element', tagName, properties, children };
}

function hastProperties(attributes: Record<string, string>): Element['properties'] {
	return Object.fromEntries(
		Object.entries(attributes).map(([name, value]) => [CAMEL_CASE_ATTRIBUTE[name] ?? name, value]),
	);
}

function copyIcons(): Element[] {
	return (Object.keys(COPY_ICON_SHAPES) as (keyof typeof COPY_ICON_SHAPES)[]).map((kind) =>
		svgElement(
			'svg',
			{ ...hastProperties(COPY_ICON_ATTRIBUTES), 'data-copy-icon': kind },
			COPY_ICON_SHAPES[kind].map((shape) => svgElement(shape.tag, hastProperties(shape.attributes))),
		),
	);
}

/** The text after the language on the opening fence, which remark-rehype keeps on the `code` node's data. */
function metaOf(code: Element): string {
	return (code.data as { meta?: string } | undefined)?.meta ?? '';
}

function buildFigure(code: Element): Element {
	const language = classNames(code)
		.map((name) => LANGUAGE_CLASS.exec(name)?.[1])
		.find(Boolean);
	const source = textOf(code).replace(/\n$/, '');
	const { lines, rootStyle } = highlightCode(source, language);
	const backgrounds = rootStyle.split(';').filter((declaration) => BACKGROUND_VARIABLE.test(declaration.trim()));

	const lineSpans: ElementContent[] = lines.flatMap((line, index): ElementContent[] => {
		const span: Element = {
			type: 'element',
			tagName: 'span',
			properties: { 'data-line': '' },
			children: line.map((token): Element => ({
				type: 'element',
				tagName: 'span',
				properties: { style: tokenStyle(token) },
				children: [{ type: 'text', value: token.content }],
			})),
		};
		return index === lines.length - 1 ? [span] : [span, { type: 'text', value: '\n' }];
	});

	return {
		type: 'element',
		tagName: 'figure',
		properties: {
			'data-rehype-pretty-code-figure': '',
			...(SHOW_LINE_NUMBERS.test(metaOf(code)) ? { 'data-line-numbers': '' } : {}),
			style: [...backgrounds, `--line-digits:${String(lines.length).length}`].join(';'),
		},
		children: [
			{
				type: 'element',
				tagName: 'pre',
				properties: { style: rootStyle, tabIndex: 0 },
				children: [
					{
						type: 'element',
						tagName: 'code',
						properties: { 'data-language': language },
						children: lineSpans,
					},
				],
			},
			{
				type: 'element',
				tagName: 'button',
				properties: {
					type: 'button',
					title: 'Copy code',
					'aria-label': 'Copy code',
					'data-copy-button': '',
					'data-rehype-pretty-copy': source,
				},
				children: copyIcons(),
			},
		],
	};
}

/**
 * @remarks
 * Recurses into every node that has children, not only elements, because a fence written inside an MDX component
 * sits under an `mdxJsxFlowElement`, which is not a hast element.
 */
function visit(node: Root | RootContent | ElementContent): void {
	if (!('children' in node)) {
		return;
	}
	const children: (RootContent | ElementContent)[] = node.children;
	children.forEach((child, index) => {
		const code = isElement(child) && child.tagName === 'pre' ? codeOf(child) : undefined;
		if (code) {
			children[index] = buildFigure(code);
			return;
		}
		visit(child);
	});
}

/**
 * Highlights every fenced code block with Pierre and gives it the figure, line and copy-button markup the docs
 * stylesheet and the base layout's copy script expect.
 *
 * @remarks
 * The figure carries the `--shiki-*-bg` variables so the copy control, which sits beside the scrolling `pre` and
 * not inside it, can match the code background. The copy button holds the exact source (without the fence's final
 * newline) in `data-rehype-pretty-copy` and two icons, copy and check, that `copy-button.css` swaps in the copied state;
 * clipboard handling lives in the base layout script. Lines are marked with `data-line`, which the stylesheet
 * selects alongside `.line`, because the MDX-to-JSX pass drops the class of an element it did not write. A fence with no
 * language, or one Pierre has no grammar for, is rendered as unhighlighted text. A fence whose meta holds
 * `showLineNumbers` gets `data-line-numbers` on its figure, which the stylesheet turns into a gutter.
 */
export const rehypePierreCode: Plugin<[], Root> = () => (tree) => {
	visit(tree);
};
