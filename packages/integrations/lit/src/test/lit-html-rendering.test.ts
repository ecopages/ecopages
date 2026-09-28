import { describe, expect, it } from 'vitest';
import { html as litHtml } from 'lit';
import {
	injectLitRenderedChildren,
	LIT_COMPONENT_CHILDREN_SLOT_MARKER,
	LIT_HTML_TEMPLATE_SLOT_MARKER,
	normalizeLitHtml,
	renderLitValueToString,
} from '../utils/lit-html-rendering.ts';

describe('lit-html-rendering', () => {
	it('normalizes duplicate declarative shadow root attributes', () => {
		expect(
			normalizeLitHtml('<template shadowroot="open" shadowrootmode="open"><span>value</span></template>'),
		).toBe('<template shadowrootmode="open"><span>value</span></template>');
	});

	it('injects rendered children through lit child slot markers', () => {
		expect(
			injectLitRenderedChildren(
				`<section><div>${LIT_COMPONENT_CHILDREN_SLOT_MARKER}</div><footer>${LIT_COMPONENT_CHILDREN_SLOT_MARKER}</footer></section>`,
				'<span>child</span>',
			),
		).toBe('<section><div><span>child</span></div><footer><span>child</span></footer></section>');
	});

	it('injects rendered children through html template slot markers', () => {
		expect(
			injectLitRenderedChildren(
				`<html><body><main>${LIT_HTML_TEMPLATE_SLOT_MARKER}</main></body></html>`,
				'<article>page</article>',
			),
		).toBe('<html><body><main><article>page</article></main></body></html>');
	});

	it('falls back to inserting children before closing body tags', () => {
		expect(injectLitRenderedChildren('<html><body class="shell"></body></html>', '<article>page</article>')).toBe(
			'<html><body class="shell"><article>page</article></body></html>',
		);
	});

	it('renders lit values to normalized strings', async () => {
		const rendered = await renderLitValueToString(litHtml`<section><span>Lit value</span></section>`);

		expect(rendered).toContain('<section>');
		expect(rendered).toContain('<span>Lit value</span>');
	});
});
