import { describe, expect, it } from 'vitest';
import { DomSwapper } from '../src/client/services/dom-swapper.ts';

function parseDocument(html: string): Document {
	return new DOMParser().parseFromString(html, 'text/html');
}

function resetDocument(): void {
	document.head.innerHTML = '';
	document.body.innerHTML = '';
}

function registerShadowCounter(): void {
	if (customElements.get('test-shadow-counter')) {
		return;
	}

	class TestShadowCounter extends HTMLElement {
		static observedAttributes = ['count'];

		constructor() {
			super();
			this.attachShadow({ mode: 'open' });
		}

		connectedCallback() {
			this.render();
		}

		attributeChangedCallback() {
			this.render();
		}

		private render() {
			if (!this.shadowRoot) {
				return;
			}

			this.shadowRoot.innerHTML = `<span data-shadow-count>${this.getAttribute('count') ?? '0'}</span>`;
		}
	}

	customElements.define('test-shadow-counter', TestShadowCounter);
}

function registerLightDomCounter(): void {
	if (customElements.get('test-light-dom-counter')) {
		return;
	}

	class TestLightDomCounter extends HTMLElement {
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
			if (countText) {
				countText.textContent = String(this.count);
			}
		}
	}

	customElements.define('test-light-dom-counter', TestLightDomCounter);
}

function renderLightDomCounter(attributes = 'count="0"'): string {
	return [
		`<test-light-dom-counter ${attributes}>`,
		'<button type="button" data-ref="decrement">-</button>',
		'<span data-ref="count">0</span>',
		'<button type="button" data-ref="increment">+</button>',
		'</test-light-dom-counter>',
	].join('');
}

describe('DomSwapper DOM behavior', () => {
	it('preserves multiple top-level body elements when replacing the body', () => {
		resetDocument();
		const swapper = new DomSwapper('data-eco-persist');
		const newDocument = parseDocument(
			'<html><body><nav>Nav</nav><main>Main</main><footer>Footer</footer></body></html>',
		);

		swapper.replaceBody(newDocument);

		expect(document.body.innerHTML).toContain('<nav>Nav</nav>');
		expect(document.body.innerHTML).toContain('<main>Main</main>');
		expect(document.body.innerHTML).toContain('<footer>Footer</footer>');
	});

	it('replaces hydrated shadow-DOM custom elements so incoming state wins', () => {
		resetDocument();
		registerShadowCounter();
		const swapper = new DomSwapper('data-eco-persist');
		document.body.innerHTML = '<test-shadow-counter count="0"></test-shadow-counter>';
		const currentCounter = document.querySelector('test-shadow-counter') as HTMLElement | null;
		currentCounter?.setAttribute('count', '5');

		const newDocument = parseDocument(
			'<html><body><test-shadow-counter count="0"></test-shadow-counter></body></html>',
		);

		swapper.morphBody(newDocument);

		const nextCounter = document.querySelector('test-shadow-counter') as HTMLElement | null;
		expect(nextCounter).not.toBeNull();
		expect(nextCounter).not.toBe(currentCounter);
		expect(nextCounter?.shadowRoot?.querySelector('[data-shadow-count]')?.textContent).toBe('0');
	});

	it('replaces light-DOM custom elements and keeps them interactive after morphing', () => {
		resetDocument();
		registerLightDomCounter();
		const swapper = new DomSwapper('data-eco-persist');
		document.body.innerHTML = renderLightDomCounter();
		const currentCounter = document.querySelector('test-light-dom-counter') as HTMLElement | null;
		currentCounter?.setAttribute('count', '5');

		const newDocument = parseDocument(`<html><body>${renderLightDomCounter()}</body></html>`);

		swapper.morphBody(newDocument);

		const nextCounter = document.querySelector('test-light-dom-counter') as HTMLElement | null;
		expect(nextCounter).not.toBeNull();
		expect(nextCounter).not.toBe(currentCounter);
		expect(nextCounter?.querySelector('[data-ref="count"]')?.textContent).toBe('0');

		const incrementButton = nextCounter?.querySelector<HTMLButtonElement>('[data-ref="increment"]');
		expect(incrementButton).not.toBeNull();
		incrementButton?.click();
		expect(nextCounter?.querySelector('[data-ref="count"]')?.textContent).toBe('1');
	});

	it('preserves persisted light-DOM custom elements when replacing the body', () => {
		resetDocument();
		registerLightDomCounter();
		const swapper = new DomSwapper('data-eco-persist');
		document.body.innerHTML = renderLightDomCounter('data-eco-persist="docs-sidebar" count="0"');
		const currentCounter = document.querySelector('test-light-dom-counter') as
			| (HTMLElement & { marker?: string })
			| null;
		currentCounter?.setAttribute('count', '5');
		if (currentCounter) {
			currentCounter.marker = 'kept';
		}

		const newDocument = parseDocument(
			`<html><body>${renderLightDomCounter('data-eco-persist="docs-sidebar" count="0"')}</body></html>`,
		);

		swapper.replaceBody(newDocument);

		const nextCounter = document.querySelector('test-light-dom-counter') as
			| (HTMLElement & { marker?: string })
			| null;
		expect(nextCounter).toBe(currentCounter);
		expect(nextCounter?.marker).toBe('kept');
		expect(nextCounter?.querySelector('[data-ref="count"]')?.textContent).toBe('5');

		const incrementButton = nextCounter?.querySelector<HTMLButtonElement>('[data-ref="increment"]');
		expect(incrementButton).not.toBeNull();
		incrementButton?.click();
		expect(nextCounter?.querySelector('[data-ref="count"]')?.textContent).toBe('6');
	});

	it('does not retain stale siblings when duplicate ids appear across navigations', () => {
		resetDocument();
		const swapper = new DomSwapper('data-eco-persist');
		document.body.innerHTML = [
			'<main>',
			'<h1>Routing Patterns</h1>',
			'<h3 id="when-to-use">When to Use</h3>',
			'<p>Alpha section</p>',
			'<h3 id="example">Example</h3>',
			'<p>Alpha example</p>',
			'<h3 id="when-to-use">When to Use</h3>',
			'<p>Beta section</p>',
			'<h3 id="example">Example</h3>',
			'<p>Beta example</p>',
			'</main>',
		].join('');

		const nextDocument = parseDocument(
			[
				'<html><body>',
				'<main>',
				'<h1>Ecopages JSX Integration</h1>',
				'<h2>Installation</h2>',
				'<p>Install the integration.</p>',
				'</main>',
				'</body></html>',
			].join(''),
		);

		swapper.morphBody(nextDocument);

		expect(document.body.textContent).toContain('Ecopages JSX Integration');
		expect(document.body.textContent).not.toContain('Routing Patterns');
		expect(document.body.textContent).not.toContain('Alpha section');
		expect(document.body.textContent).not.toContain('Beta example');
		expect(document.querySelectorAll('#when-to-use')).toHaveLength(0);
		expect(document.querySelectorAll('#example')).toHaveLength(0);
	});
});
