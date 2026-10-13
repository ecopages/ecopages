import { LitElement, html } from 'lit';

/**
 * Side-effect registration loaded only through a route-resolved root's `dependencies.scripts`.
 */
class SsrRouteRoot extends LitElement {
	static override properties = { count: { type: Number } };

	count = 0;

	override render() {
		return html`<span data-ssr-route-root>${this.count}</span>`;
	}
}

customElements.define('lit-ssr-route-root', SsrRouteRoot);
