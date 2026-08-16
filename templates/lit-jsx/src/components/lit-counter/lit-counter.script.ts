import { html, LitElement, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import styles from './lit-counter.css';

export type LitCounterProps = {
	count?: number;
};

@customElement('lit-counter')
export class LitCounter extends LitElement {
	static styles = [unsafeCSS(styles)];

	@property({ type: Number }) declare count: number;

	decrement() {
		if (this.count > 0) this.count--;
	}

	increment() {
		this.count++;
	}

	override render() {
		return html`
			<button @click=${this.decrement} aria-label="Decrement" class="decrement">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M5 12h14" />
				</svg>
			</button>
			<span>${this.count}</span>
			<button data-increment @click=${this.increment} aria-label="Increment" class="increment">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M5 12h14" />
					<path d="M12 5v14" />
				</svg>
			</button>
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
