import type { Element, ElementContent, Root, RootContent } from 'hast';
import type { Plugin } from 'unified';

const COPY_BUTTON_CLASS = 'rehype-pretty-copy';
const COPY_SOURCE_ATTR = 'data-rehype-pretty-copy';

function isElement(node: Root | RootContent | ElementContent): node is Element {
	return node.type === 'element';
}

function classTokens(properties: Element['properties'] | undefined): string[] {
	if (!properties) {
		return [];
	}

	const value = properties.className ?? properties.class;
	if (Array.isArray(value)) {
		return value.map(String);
	}
	if (typeof value === 'string') {
		return value.split(/\s+/).filter(Boolean);
	}

	return [];
}

function isPrettyCopyButton(node: Element): boolean {
	return node.tagName === 'button' && classTokens(node.properties).includes(COPY_BUTTON_CLASS);
}

function elementText(node: Element): string {
	return node.children
		.map((child) => {
			if (child.type === 'text') {
				return child.value;
			}
			if (isElement(child)) {
				return elementText(child);
			}
			return '';
		})
		.join('');
}

function isPrettyCopyStyle(node: Element): boolean {
	return node.tagName === 'style' && elementText(node).includes(COPY_BUTTON_CLASS);
}

function isPrettyCodeFigure(node: Element): boolean {
	return node.tagName === 'figure' && node.properties != null && 'data-rehype-pretty-code-figure' in node.properties;
}

function isRewrittenCopyButton(node: Element): boolean {
	return node.tagName === 'button' && typeof node.properties?.[COPY_SOURCE_ATTR] === 'string';
}

function rewriteCopyButton(node: Element): void {
	const properties = node.properties ?? {};
	const source = typeof properties.data === 'string' ? properties.data : '';

	delete properties.class;
	delete properties.className;
	delete properties.data;
	delete properties.onclick;
	delete properties.onClick;

	properties.type = properties.type ?? 'button';
	properties.title = properties.title ?? 'Copy code';
	properties['aria-label'] = properties['aria-label'] ?? 'Copy code';
	properties[COPY_SOURCE_ATTR] = source;

	node.properties = properties;
	node.children = [{ type: 'text', value: 'Copy' }];
}

function cssText(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function shikiCustomProperties(style: string): string[] {
	return style
		.split(';')
		.map((declaration) => declaration.trim())
		.filter((declaration) => /^--shiki-(light|dark)-bg:/.test(declaration));
}

/**
 * @remarks
 * Pretty-code writes the Shiki background variables on `pre`. Moving them onto the figure lets the
 * copy control match the highlighter background. Without them, it uses the site background.
 */
function promoteShikiVariables(figure: Element): void {
	const pre = figure.children.find((child): child is Element => isElement(child) && child.tagName === 'pre');
	if (!pre) {
		return;
	}

	const declarations = shikiCustomProperties(cssText(pre.properties?.style));
	if (declarations.length === 0) {
		return;
	}

	const current = cssText(figure.properties?.style);
	const already = new Set(shikiCustomProperties(current));
	const added = declarations.filter((declaration) => !already.has(declaration));
	if (added.length === 0) {
		return;
	}

	figure.properties = {
		...figure.properties,
		style: [current, ...added].filter(Boolean).join('; '),
	};
}

/**
 * @remarks
 * `transformerCopyButton` appends the control to `code`. Absolute positioning
 * inside `pre { overflow-x: auto }` then scrolls the button with the source.
 */
function hoistCopyButton(figure: Element): void {
	const preIndex = figure.children.findIndex((child) => isElement(child) && child.tagName === 'pre');
	const pre = figure.children[preIndex];
	if (pre?.type !== 'element') {
		return;
	}

	const code = pre.children.find((child): child is Element => isElement(child) && child.tagName === 'code');
	const buttonIndex = code?.children.findIndex((child) => isElement(child) && isRewrittenCopyButton(child)) ?? -1;
	if (!code || buttonIndex === -1) {
		return;
	}

	const [button] = code.children.splice(buttonIndex, 1);
	figure.children.splice(preIndex + 1, 0, button);
}

function visit(node: Root | Element): void {
	node.children = node.children.filter(
		(child) => !(isElement(child) && isPrettyCopyStyle(child)),
	) as typeof node.children;

	for (const child of node.children) {
		if (!isElement(child)) {
			continue;
		}

		if (isPrettyCopyButton(child)) {
			rewriteCopyButton(child);
			continue;
		}

		visit(child);
	}

	if (isElement(node) && isPrettyCodeFigure(node)) {
		hoistCopyButton(node);
		promoteShikiVariables(node);
	}
}

/**
 * Rewrites `transformerCopyButton` markup so the MDX JSX renderer can emit a working copy control.
 *
 * @remarks
 * The experimental transformer stores source on a generic `data` attribute and uses `class` plus
 * inline `onclick`. Those do not survive our MDX-to-JSX pass, so this plugin copies the source onto
 * `data-rehype-pretty-copy`, strips the incompatible attributes, replaces icon children with "Copy",
 * drops the transformer `<style>` node, moves the button onto the figure so it is not a
 * descendant of the scrolling `pre`, and copies the Shiki background variables onto the
 * figure so the chip can use the highlighter background. Clipboard handling lives in the
 * base layout script.
 */
export const rehypePrettyCopyCompatibility: Plugin<[], Root> = () => {
	return (tree) => {
		visit(tree);
	};
};
