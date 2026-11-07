import { html, LitElement } from 'lit';
import { recordSsrScriptEvaluation } from './ssr-script-evaluations.ts';

recordSsrScriptEvaluation('ssr-once-lit-probe');

export class SsrOnceLitProbeElement extends LitElement {
	override render() {
		return html`<span data-ssr-once-lit-probe>lit-once</span>`;
	}
}

if (!customElements.get('ssr-once-lit-probe')) {
	customElements.define('ssr-once-lit-probe', SsrOnceLitProbeElement);
}
