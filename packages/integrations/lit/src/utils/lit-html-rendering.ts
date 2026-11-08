import { render } from '@lit-labs/ssr';
import { html as staticHtml, unsafeStatic } from 'lit/static-html.js';

export const LIT_HTML_TEMPLATE_SLOT_MARKER = '<--content-->';
export const LIT_COMPONENT_CHILDREN_SLOT_MARKER = '<!--eco-lit-component-children-->';

const ESCAPED_COMPONENT_CHILDREN_SLOT_MARKER = '&lt;!--eco-lit-component-children--&gt;';
const DOUBLE_ESCAPED_COMPONENT_CHILDREN_SLOT_MARKER = '&amp;lt;!--eco-lit-component-children--&amp;gt;';
const DUPLICATE_DECLARATIVE_SHADOW_ROOT_ATTRIBUTE = /\sshadowroot=(['"])(open|closed)\1(?=\sshadowrootmode=\1\2\1)/g;

export function normalizeLitHtml(markup: string): string {
	return markup.replace(DUPLICATE_DECLARATIVE_SHADOW_ROOT_ATTRIBUTE, '');
}

/**
 * Puts rendered children where the template's slot marker is.
 *
 * @remarks
 * Only a document shell without a marker gets its children before `</body>` or `</html>`. Any other template
 * without a marker did not render its children, and they are dropped, so layout composition can report it.
 */
export function injectLitRenderedChildren(template: string, renderedChildren: string): string {
	for (const marker of [
		LIT_COMPONENT_CHILDREN_SLOT_MARKER,
		ESCAPED_COMPONENT_CHILDREN_SLOT_MARKER,
		DOUBLE_ESCAPED_COMPONENT_CHILDREN_SLOT_MARKER,
	]) {
		if (template.includes(marker)) {
			return template.split(marker).join(renderedChildren);
		}
	}

	if (template.includes(LIT_HTML_TEMPLATE_SLOT_MARKER)) {
		return template.split(LIT_HTML_TEMPLATE_SLOT_MARKER).join(renderedChildren);
	}

	if (!template.includes('</html>')) {
		return template;
	}

	if (template.includes('</body>')) {
		return template.replace('</body>', `${renderedChildren}</body>`);
	}

	return template.replace('</html>', `${renderedChildren}</html>`);
}

export async function renderLitValueToString(value: unknown): Promise<string> {
	if (typeof value === 'string') {
		let renderedHtml = '';
		for (const chunk of render(staticHtml`${unsafeStatic(value)}`)) {
			renderedHtml += chunk;
		}

		return normalizeLitHtml(renderedHtml);
	}

	let renderedHtml = '';
	for (const chunk of render(value as Parameters<typeof render>[0])) {
		renderedHtml += chunk;
	}

	return normalizeLitHtml(renderedHtml);
}

const CUSTOM_ELEMENT_OPEN_TAG = /<([a-z][a-z0-9._]*-[a-z0-9._-]*)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const DECLARATIVE_SHADOW_ROOT_START = /^\s*<template\b[^>]*\sshadowrootmode=/i;
const LIT_PART_WRAPPER_START = /^<!--lit-part[^>]*?-->/;
const LIT_PART_WRAPPER_END = /<!--\/lit-part-->$/;
const RENDERED_ELEMENT_PLACEHOLDER = 'ecolitrendered';

/** Finds where the element opened at `openEnd` closes, counting nested elements of the same name. */
function findElementEnd(markup: string, name: string, openEnd: number): { start: number; end: number } | undefined {
	const tag = new RegExp(`<(/?)${name.replaceAll('.', '\\.')}(?=[\\s/>])[^>]*>`, 'gi');
	tag.lastIndex = openEnd;
	let depth = 1;
	for (let match = tag.exec(markup); match; match = tag.exec(markup)) {
		depth += match[1] ? -1 : 1;
		if (depth === 0) {
			return { start: match.index, end: match.index + match[0].length };
		}
	}

	return undefined;
}

/**
 * Hides the custom elements that already have a declarative shadow root, so rendering them again does not give them
 * a second one.
 *
 * @returns The markup with each such element renamed to a placeholder that is not a custom element. `names` collects
 * the original names, in placeholder order, for restoring them.
 */
function hideRenderedCustomElements(markup: string, names: string[]): string {
	const openTag = new RegExp(CUSTOM_ELEMENT_OPEN_TAG);
	let result = '';
	let cursor = 0;

	for (let match = openTag.exec(markup); match; match = openTag.exec(markup)) {
		const openEnd = match.index + match[0].length;
		if (!DECLARATIVE_SHADOW_ROOT_START.test(markup.slice(openEnd, openEnd + 200))) {
			continue;
		}

		const close = findElementEnd(markup, match[1], openEnd);
		if (!close) {
			continue;
		}

		const placeholder = `${RENDERED_ELEMENT_PLACEHOLDER}${names.length}`;
		names.push(match[1]);
		result += markup.slice(cursor, match.index);
		result += `<${placeholder}${match[0].slice(match[1].length + 1)}`;
		result += hideRenderedCustomElements(markup.slice(openEnd, close.start), names);
		result += `</${placeholder}>`;
		cursor = close.end;
		openTag.lastIndex = close.end;
	}

	return result + markup.slice(cursor);
}

/**
 * Server-renders the registered custom elements in markup another Integration produced.
 *
 * @remarks
 * Lit gives an element a declarative shadow root only for markup that passes through its server renderer, so a Lit
 * element in a Kita Component, or in a Foreign Subtree spliced into a Lit Page, would otherwise ship empty. Core calls
 * this on a Page document whose `ssr: true` scripts are assigned to Lit.
 *
 * An element that already has a declarative shadow root was rendered by Lit and is left alone, so a document that
 * mixes both is safe to pass through. `@lit-labs/ssr` gives every Lit element a shadow root template, also one that
 * sets `createRenderRoot` to render into the light DOM or adds `renderLight()` output, so that is the one signal.
 * Markup with no custom element tag is returned as it is.
 */
export async function renderLitCustomElementsInMarkup(markup: string): Promise<string> {
	const names: string[] = [];
	const hidden = hideRenderedCustomElements(markup, names);
	if (!new RegExp(CUSTOM_ELEMENT_OPEN_TAG).test(hidden)) {
		return markup;
	}

	const rendered = (await renderLitValueToString(hidden))
		.replace(LIT_PART_WRAPPER_START, '')
		.replace(LIT_PART_WRAPPER_END, '');

	return rendered.replace(
		new RegExp(`(</?)${RENDERED_ELEMENT_PLACEHOLDER}(\\d+)(?=[\\s/>])`, 'g'),
		(_match, slash, index) => {
			return `${slash}${names[Number(index)]}`;
		},
	);
}
