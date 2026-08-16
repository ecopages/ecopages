const TAG = 'demo-counter';

class DemoCounterElement extends HTMLElement {
	private count = 0;
	private countText: HTMLElement | null = null;

	connectedCallback() {
		this.count = Number(this.getAttribute('count')) || 0;
		this.countText = this.querySelector('[data-ref="count"]');

		this.querySelector('[data-ref="decrement"]')?.addEventListener('click', () => this.update(-1));
		this.querySelector('[data-ref="increment"]')?.addEventListener('click', () => this.update(1));
		this.render();
	}

	private update(delta: number) {
		this.count += delta;
		this.setAttribute('count', String(this.count));
		this.render();
	}

	private render() {
		if (this.countText) {
			this.countText.textContent = String(this.count);
		}
	}
}

if (!customElements.get(TAG)) {
	customElements.define(TAG, DemoCounterElement);
}
