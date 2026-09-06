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
}

/**
 * Rewrites `transformerCopyButton` markup so the MDX JSX renderer can emit a working copy control.
 *
 * @remarks
 * The experimental transformer stores source on a generic `data` attribute and uses `class` plus
 * inline `onclick`. Those do not survive our MDX-to-JSX pass, so this plugin copies the source onto
 * `data-rehype-pretty-copy`, strips the incompatible attributes, replaces icon children with "Copy",
 * and drops the transformer `<style>` node. Clipboard handling lives in the base layout script.
 */
export const rehypePrettyCopyCompatibility: Plugin<[], Root> = () => {
	return (tree) => {
		visit(tree);
	};
};
