import { LitElement, html } from 'lit';

class SsrLazyLayout extends LitElement {
	static override properties = { count: { type: Number } };

	count = 0;

	override render() {
		return html`<span data-ssr-lazy-layout>${this.count}</span>`;
	}
}

customElements.define('lit-ssr-lazy-layout', SsrLazyLayout);
