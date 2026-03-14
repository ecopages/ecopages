import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export type LitCounterProps = {
	count?: number;
};

@customElement('lit-counter')
export class LitCounterElement extends LitElement {
	static override styles = css`
		:host {
			display: inline-flex;
		}

		.wrapper {
			display: inline-flex;
			align-items: center;
			gap: 0.75rem;
			border: 1px solid var(--color-border);
			background: var(--color-background-accent);
			border-radius: 999px;
			padding: 0.5rem 1rem;
			color: var(--color-on-background-accent);
			font-size: 0.875rem;
		}

		button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 2rem;
			height: 2rem;
			border-radius: 999px;
			border: 1px solid var(--color-border);
			background: var(--color-background);
			color: var(--color-on-background);
			cursor: pointer;
		}

		span {
			min-width: 1.5rem;
			font-family: var(--font-mono);
			text-align: center;
		}
	`;

	@property({ type: Number }) declare count: number;

	constructor() {
		super();
		this.count = 0;
	}

	increment = () => {
		this.count += 1;
	};

	override render() {
		return html`
			<div class="wrapper" data-lit-counter>
				<button type="button" data-lit-inc @click=${this.increment}>+</button>
				<span data-lit-value>${this.count}</span>
			</div>
		`;
	}
}

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'lit-counter': HtmlTag & LitCounterProps;
		}
	}
	namespace React.JSX {
		interface IntrinsicElements {
			'lit-counter': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & LitCounterProps, HTMLElement>;
		}
	}
}
