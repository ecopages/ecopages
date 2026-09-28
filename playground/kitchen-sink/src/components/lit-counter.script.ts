import { html, LitElement, unsafeCSS } from 'lit';
import styles from './lit-counter.css';

export type LitCounterProps = {
	count?: number;
};

export class LitCounterElement extends LitElement {
	static override styles = [unsafeCSS(styles)];
	static override properties = {
		count: { type: Number },
	};

	declare count: number;

	constructor() {
		super();
		this.count = 0;
	}

	increment = () => {
		this.count += 1;
	};

	override render() {
		return html`
			<div class="wrapper" data-lit-counter data-counter-kind="lit">
				<button type="button" data-lit-inc @click=${this.increment}>+</button>
				<span data-lit-value>${this.count}</span>
			</div>
		`;
	}
}

if (!customElements.get('lit-counter')) {
	customElements.define('lit-counter', LitCounterElement);
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
