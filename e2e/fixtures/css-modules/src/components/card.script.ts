import { html, LitElement } from 'lit';
import styles from './card.module.css';

export class CssModulesCard extends LitElement {
	static override properties = {
		count: { type: Number },
	};

	declare count: number;

	constructor() {
		super();
		this.count = 0;
	}

	override render() {
		return html`<button type="button" data-testid="lit-card" class=${styles.card} @click=${() => (this.count += 1)}>
			Lit ${this.count}
		</button>`;
	}
}

if (!customElements.get('css-modules-card')) {
	customElements.define('css-modules-card', CssModulesCard);
}
