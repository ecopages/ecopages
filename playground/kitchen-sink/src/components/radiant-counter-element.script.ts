/** @jsxImportSource @ecopages/jsx */
import { RadiantElement, query, onEvent, onUpdated } from '@ecopages/radiant';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { prop } from '@ecopages/radiant/decorators/prop';

export type RadiantCounterProps = {
	value?: number;
};

@customElement('radiant-counter')
export class RadiantCounterElement extends RadiantElement {
	@prop({ type: Number, reflect: true, defaultValue: 0 }) declare value: number;
	@query({ ref: 'count' }) countText!: HTMLElement;

	@onEvent({ ref: 'increment', type: 'click' })
	increment() {
		this.value++;
	}

	@onUpdated('value')
	updateCount() {
		this.countText.textContent = this.value.toString();
	}
}

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'radiant-counter': HtmlTag & RadiantCounterProps;
		}
	}
}
