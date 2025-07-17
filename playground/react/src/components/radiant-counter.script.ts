import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onEvent } from '@ecopages/radiant/decorators/on-event';
import { onUpdated } from '@ecopages/radiant/decorators/on-updated';
import { query } from '@ecopages/radiant/decorators/query';
import { reactiveProp } from '@ecopages/radiant/decorators/reactive-prop';

export type RadiantCounterProps = {
	value?: number;
	class?: string;
};

@customElement('radiant-counter')
export class RadiantCounter extends RadiantElement {
	@reactiveProp({ type: Number, reflect: true, defaultValue: 0 }) value!: number;
	@query({ ref: 'count' }) countText!: HTMLElement;

	@onEvent({ ref: 'decrement', type: 'click' })
	decrement() {
		if (this.value > 0) this.value--;
	}

	@onEvent({ ref: 'increment', type: 'click' })
	increment() {
		this.value++;
	}

	@onUpdated('value')
	updateCount() {
		this.countText.textContent = this.value.toString();
	}
}

declare module 'react' {
	namespace JSX {
		interface IntrinsicElements {
			'radiant-counter': PropsWithChildren<RadiantCounterProps>;
		}
	}
}
