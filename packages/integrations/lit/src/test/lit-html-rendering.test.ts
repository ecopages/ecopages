import { describe, expect, it } from 'vitest';
import { html as litHtml, LitElement } from 'lit';
import { ensureLitDomShim } from '../dom-shim.ts';

ensureLitDomShim();
import {
	injectLitRenderedChildren,
	LIT_COMPONENT_CHILDREN_SLOT_MARKER,
	LIT_HTML_TEMPLATE_SLOT_MARKER,
	normalizeLitHtml,
	renderLitCustomElementsInMarkup,
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

	it('drops children that a component template does not render', () => {
		expect(injectLitRenderedChildren('<aside>no slot</aside>', '<article>page</article>')).toBe(
			'<aside>no slot</aside>',
		);
	});

	it('renders lit values to normalized strings', async () => {
		const rendered = await renderLitValueToString(litHtml`<section><span>Lit value</span></section>`);

		expect(rendered).toContain('<section>');
		expect(rendered).toContain('<span>Lit value</span>');
	});
});

describe('renderLitCustomElementsInMarkup', () => {
	class RenderedProbe extends LitElement {
		override render() {
			return litHtml`<span data-probe>shadow</span>`;
		}
	}
	if (!customElements.get('rendered-probe')) {
		customElements.define('rendered-probe', RenderedProbe);
	}

	const countShadowRoots = (html: string) => html.match(/<template shadowrootmode="open">/g)?.length ?? 0;

	it('gives a registered element in plain markup a declarative shadow root', async () => {
		const html = await renderLitCustomElementsInMarkup('<div><rendered-probe class="a"></rendered-probe></div>');

		expect(html).toMatch(/^<div><rendered-probe\s+class="a"><template shadowrootmode="open">/);
		expect(html).toContain('<span data-probe>shadow</span>');
		expect(countShadowRoots(html)).toBe(1);
	});

	it('keeps the document prologue and drops the wrapper comments of the pass', async () => {
		const html = await renderLitCustomElementsInMarkup(
			'<!DOCTYPE html><html><body><rendered-probe></rendered-probe></body></html>',
		);

		expect(html.startsWith('<!DOCTYPE html><html>')).toBe(true);
		expect(html.endsWith('</html>')).toBe(true);
	});

	it('leaves an element that already has a declarative shadow root alone', async () => {
		const rendered = await renderLitValueToString('<rendered-probe></rendered-probe>');
		const html = await renderLitCustomElementsInMarkup(
			`<main>${rendered}<rendered-probe id="plain"></rendered-probe></main>`,
		);

		expect(countShadowRoots(html)).toBe(2);
		expect(html).toContain(rendered);
	});

	it('renders an element nested in the light DOM of one it left alone', async () => {
		const rendered = await renderLitValueToString('<rendered-probe></rendered-probe>');
		const outer = rendered.replace(
			'</rendered-probe>',
			'<rendered-probe id="inner"></rendered-probe></rendered-probe>',
		);
		const html = await renderLitCustomElementsInMarkup(outer);

		expect(countShadowRoots(html)).toBe(countShadowRoots(outer) + 1);
	});

	it('leaves an element that renders into the light DOM alone once Lit rendered it', async () => {
		class LightProbe extends LitElement {
			override createRenderRoot() {
				return this;
			}
			renderLight() {
				return litHtml`<p data-light>light</p>`;
			}
			override render() {
				return litHtml`<b>shadow</b>`;
			}
		}
		if (!customElements.get('light-probe')) {
			customElements.define('light-probe', LightProbe);
		}
		const rendered = await renderLitValueToString('<light-probe></light-probe>');

		expect(await renderLitCustomElementsInMarkup(rendered)).toBe(rendered);
	});

	it('returns markup without a custom element as it is', async () => {
		const markup = '<p>plain &amp; simple</p>';

		expect(await renderLitCustomElementsInMarkup(markup)).toBe(markup);
	});

	it('returns markup whose elements are all rendered as it is', async () => {
		const markup = await renderLitValueToString('<rendered-probe></rendered-probe>');

		expect(await renderLitCustomElementsInMarkup(markup)).toBe(markup);
	});
});
