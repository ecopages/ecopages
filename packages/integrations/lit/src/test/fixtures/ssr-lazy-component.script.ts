import { LitElement, html } from 'lit';

/**
 * Side-effect registration loaded only through `dependencies.scripts`.
 *
 * @remarks
 * The tag is registered globally and cannot be undefined, so each test that
 * relies on a fresh registration has its own script and tag.
 */
class SsrLazyComponent extends LitElement {
	static override properties = { count: { type: Number } };

	count = 0;

	override render() {
		return html`<span data-ssr-lazy-component>${this.count}</span>`;
	}
}

customElements.define('lit-ssr-lazy-component', SsrLazyComponent);
