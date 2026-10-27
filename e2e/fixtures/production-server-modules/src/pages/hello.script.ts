import { LitElement, html } from 'lit';

export class HelloSsr extends LitElement {
	override render() {
		return html`<span>hello-ssr</span>`;
	}
}

customElements.define('hello-ssr', HelloSsr);

export default HelloSsr;
