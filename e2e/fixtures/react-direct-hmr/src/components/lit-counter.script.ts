import { html, LitElement } from 'lit';

export type LitCounterProps = {
	count?: number;
};

export class LitCounterElement extends LitElement {
	static override properties = {
		count: { type: Number },
	};

	declare count: number;

	constructor() {
		super();
		this.count = 0;
	}

	override render() {
		return html`<span data-lit-value>${this.count}</span>`;
	}
}

if (!customElements.get('lit-counter')) {
	customElements.define('lit-counter', LitCounterElement);
}

declare global {
	namespace React.JSX {
		interface IntrinsicElements {
			'lit-counter': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & LitCounterProps, HTMLElement>;
		}
	}
}
