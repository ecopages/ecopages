import { LitElement, html, unsafeCSS } from 'lit';
import styles from './counter-element.css';

class DiscoveryCounter extends LitElement {
	static override styles = unsafeCSS(styles);
	static override properties = { count: { type: Number } };
	declare count: number;
	constructor() {
		super();
		this.count = 7;
	}
	override render() {
		return html`<button
				data-discovery-increment
				@click=${() => {
					this.count += 1;
				}}
			>
				Increment</button
			><span data-discovery-value>${this.count}</span>`;
	}
}

if (!customElements.get('discovery-counter')) customElements.define('discovery-counter', DiscoveryCounter);
