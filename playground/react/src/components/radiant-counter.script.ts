export type RadiantCounterProps = {
	count?: number;
	class?: string;
};

export class RadiantCounter extends HTMLElement {
	static observedAttributes = ['count'];

	connectedCallback() {
		this.querySelector('[data-ref="decrement"]')?.addEventListener('click', this.decrement);
		this.querySelector('[data-ref="increment"]')?.addEventListener('click', this.increment);
		this.updateCount();
	}

	disconnectedCallback() {
		this.querySelector('[data-ref="decrement"]')?.removeEventListener('click', this.decrement);
		this.querySelector('[data-ref="increment"]')?.removeEventListener('click', this.increment);
	}

	attributeChangedCallback(name: string) {
		if (name === 'count') {
			this.updateCount();
		}
	}

	get count(): number {
		return Number(this.getAttribute('count') ?? 0);
	}

	set count(value: number) {
		this.setAttribute('count', String(value));
	}

	private decrement = () => {
		if (this.count > 0) {
			this.count -= 1;
		}
	};

	private increment = () => {
		this.count += 1;
	};

	private updateCount() {
		const countText = this.querySelector('[data-ref="count"]');
		if (!countText) {
			return;
		}

		countText.textContent = String(this.count);
	}
}

if (!customElements.get('radiant-counter')) {
	customElements.define('radiant-counter', RadiantCounter);
}

declare module 'react' {
	namespace JSX {
		interface IntrinsicElements {
			'radiant-counter': PropsWithChildren<RadiantCounterProps>;
		}
	}
}
