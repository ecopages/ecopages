import { LitElement, html } from 'lit';

class SsrLazyPage extends LitElement {
	static override properties = { count: { type: Number } };

	count = 0;

	override render() {
		return html`<span data-ssr-lazy-page>${this.count}</span>`;
	}
}

customElements.define('lit-ssr-lazy-page', SsrLazyPage);
