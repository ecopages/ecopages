import { LitElement, html } from 'lit';

class SsrEagerPage extends LitElement {
	static override properties = { count: { type: Number } };

	count = 0;

	override render() {
		return html`<span data-ssr-eager-page>${this.count}</span>`;
	}
}

customElements.define('lit-ssr-eager-page', SsrEagerPage);
