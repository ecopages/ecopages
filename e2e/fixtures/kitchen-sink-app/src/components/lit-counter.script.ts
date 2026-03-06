import { html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export type LitCounterProps = {
	count?: number;
};

@customElement('lit-counter')
export class LitCounter extends LitElement {
	@property({ type: Number }) declare count: number;

	constructor() {
		super();
		this.count = 0;
	}

	increment = () => {
		this.count++;
	};

	render() {
		return html`
			<button type="button" data-lit-inc @click=${this.increment}>+</button>
			<span data-lit-value>${this.count}</span>
		`;
	}
}

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'lit-counter': HtmlTag & LitCounterProps;
		}
	}
}
