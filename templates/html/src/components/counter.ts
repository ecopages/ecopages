const TAG = 'demo-counter';

export class DemoCounterElement extends HTMLElement {
	private count = 0;
	private countText: HTMLElement | null = null;
	private listeners: AbortController | null = null;

	connectedCallback() {
		this.count = Number(this.getAttribute('count')) || 0;
		this.countText = this.querySelector('[data-ref="count"]');
		this.listeners = new AbortController();
		const { signal } = this.listeners;

		this.querySelector('[data-ref="decrement"]')?.addEventListener('click', () => this.update(-1), { signal });
		this.querySelector('[data-ref="increment"]')?.addEventListener('click', () => this.update(1), { signal });
		this.render();
	}

	disconnectedCallback() {
		this.listeners?.abort();
		this.listeners = null;
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
