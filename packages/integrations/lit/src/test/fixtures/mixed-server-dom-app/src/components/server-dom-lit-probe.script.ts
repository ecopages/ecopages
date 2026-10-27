import { html, LitElement } from 'lit';

export class ServerDomLitProbeElement extends LitElement {
	override render() {
		return html`<span data-server-dom-lit-probe>lit-shadow</span>`;
	}
}

if (!customElements.get('server-dom-lit-probe')) {
	customElements.define('server-dom-lit-probe', ServerDomLitProbeElement);
}
