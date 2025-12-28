import { customElement, onEvent, onUpdated, query, RadiantElement, reactiveProp } from '@ecopages/radiant';

export type RadiantCounterProps = {
	count?: number;
};

@customElement('radiant-counter')
export class RadiantCounter extends RadiantElement {
	@reactiveProp({ type: Number, reflect: true }) declare count: number;
	@query({ ref: 'count' }) countText!: HTMLElement;
	/**
	 * This field is used to test the persistence of the element using the EcoRouter.
	 */
	testPersist = new Date();

	@onEvent({ ref: 'decrement', type: 'click' })
	decrement() {
		if (this.count > 0) this.count--;
		console.log(this.testPersist);
	}

	@onEvent({ ref: 'increment', type: 'click' })
	increment() {
		this.count++;
		console.log(this.testPersist);
	}

	@onUpdated('count')
	updateCount() {
		this.countText.textContent = this.count.toString();
	}
}

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'radiant-counter': HtmlTag & RadiantCounterProps;
		}
	}
}
