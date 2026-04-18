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

	if (template.includes('</body>')) {
		return template.replace('</body>', `${renderedChildren}</body>`);
	}

	if (template.includes('</html>')) {
		return template.replace('</html>', `${renderedChildren}</html>`);
	}

	return `${template}${renderedChildren}`;
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