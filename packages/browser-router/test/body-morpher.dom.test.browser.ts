import { describe, expect, it } from 'vitest';
import { morphBody, recordInitialServerMarkup, type ServerMarkup } from '../src/client/dom/body-morpher.ts';

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

function renderLightDomCounterPage(counters: Array<{ id: string; count: number }>): string {
	return counters
		.map(({ id, count }) => renderLightDomCounter(`data-counter-id="${id}" count="${String(count)}"`))
		.join('');
}

describe('morphBody DOM behavior', () => {
	it('preserves multiple top-level body elements during a swap', () => {
		resetDocument();
		const newDocument = parseDocument(
			'<html><body><nav>Nav</nav><main>Main</main><footer>Footer</footer></body></html>',
		);

		morphBody(newDocument, 'data-eco-persist');

		expect(document.body.innerHTML).toContain('<nav>Nav</nav>');
		expect(document.body.innerHTML).toContain('<main>Main</main>');
		expect(document.body.innerHTML).toContain('<footer>Footer</footer>');
	});

	it('replaces hydrated shadow-DOM custom elements so incoming state wins', () => {
		resetDocument();
		registerShadowCounter();
		document.body.innerHTML = '<test-shadow-counter count="0"></test-shadow-counter>';
		const currentCounter = document.querySelector('test-shadow-counter') as HTMLElement | null;
		currentCounter?.setAttribute('count', '5');

		const newDocument = parseDocument(
			'<html><body><test-shadow-counter count="0"></test-shadow-counter></body></html>',
		);

		morphBody(newDocument, 'data-eco-persist');

		const nextCounter = document.querySelector('test-shadow-counter') as HTMLElement | null;
		expect(nextCounter).not.toBeNull();
		expect(nextCounter).not.toBe(currentCounter);
		expect(nextCounter?.shadowRoot?.querySelector('[data-shadow-count]')?.textContent).toBe('0');
	});

	it('replaces light-DOM custom elements and keeps them interactive after morphing', () => {
		resetDocument();
		registerLightDomCounter();
		document.body.innerHTML = renderLightDomCounter();
		const currentCounter = document.querySelector('test-light-dom-counter') as HTMLElement | null;
		currentCounter?.setAttribute('count', '5');

		const newDocument = parseDocument(`<html><body>${renderLightDomCounter()}</body></html>`);

		morphBody(newDocument, 'data-eco-persist');

		const nextCounter = document.querySelector('test-light-dom-counter') as HTMLElement | null;
		expect(nextCounter).not.toBeNull();
		expect(nextCounter).not.toBe(currentCounter);
		expect(nextCounter?.querySelector('[data-ref="count"]')?.textContent).toBe('0');

		const incrementButton = nextCounter?.querySelector<HTMLButtonElement>('[data-ref="increment"]');
		expect(incrementButton).not.toBeNull();
		incrementButton?.click();
		expect(nextCounter?.querySelector('[data-ref="count"]')?.textContent).toBe('1');
	});

	it('preserves incoming light-DOM custom element markup across repeated navigations', () => {
		resetDocument();
		registerLightDomCounter();
		document.body.innerHTML = `<main>${renderLightDomCounterPage([
			{ id: 'introduction-init', count: 5 },
			{ id: 'introduction-next-steps', count: 7 },
		])}</main>`;

		const installationDocument = parseDocument(
			`<html><body><main>${renderLightDomCounterPage([{ id: 'installation', count: 3 }])}</main></body></html>`,
		);
		morphBody(installationDocument, 'data-eco-persist');

		const introductionDocument = parseDocument(
			`<html><body><main>${renderLightDomCounterPage([
				{ id: 'introduction-init', count: 5 },
				{ id: 'introduction-next-steps', count: 7 },
			])}</main></body></html>`,
		);
		morphBody(introductionDocument, 'data-eco-persist');

		const counters = Array.from(document.querySelectorAll<HTMLElement>('test-light-dom-counter'));
		expect(counters).toHaveLength(2);
		expect(counters.map((counter) => counter.getAttribute('data-counter-id'))).toEqual([
			'introduction-init',
			'introduction-next-steps',
		]);
		expect(counters.map((counter) => counter.getAttribute('count'))).toEqual(['5', '7']);
		expect(counters.map((counter) => counter.querySelector('[data-ref="count"]')?.textContent)).toEqual(['5', '7']);

		const incrementButton = counters[0]?.querySelector<HTMLButtonElement>('[data-ref="increment"]');
		expect(incrementButton).not.toBeNull();
		incrementButton?.click();
		expect(counters[0]?.querySelector('[data-ref="count"]')?.textContent).toBe('6');
	});

	it('preserves persisted light-DOM custom elements during a body morph', () => {
		resetDocument();
		registerLightDomCounter();
		document.body.innerHTML = renderLightDomCounter('data-eco-persist="docs-sidebar" count="0"');
		const currentCounter = document.querySelector('test-light-dom-counter') as
			(HTMLElement & { marker?: string }) | null;
		currentCounter?.setAttribute('count', '5');
		if (currentCounter) {
			currentCounter.marker = 'kept';
		}

		const newDocument = parseDocument(
			`<html><body>${renderLightDomCounter('data-eco-persist="docs-sidebar" count="0"')}</body></html>`,
		);

		morphBody(newDocument, 'data-eco-persist');

		const nextCounter = document.querySelector('test-light-dom-counter') as
			(HTMLElement & { marker?: string }) | null;
		expect(nextCounter).toBe(currentCounter);
		expect(nextCounter?.marker).toBe('kept');
		expect(nextCounter?.querySelector('[data-ref="count"]')?.textContent).toBe('5');

		const incrementButton = nextCounter?.querySelector<HTMLButtonElement>('[data-ref="increment"]');
		expect(incrementButton).not.toBeNull();
		incrementButton?.click();
		expect(nextCounter?.querySelector('[data-ref="count"]')?.textContent).toBe('6');
	});

	it('keeps light-DOM custom element children active when rerun scripts accompany a persisted descendant', () => {
		resetDocument();
		registerLightDomCounter();
		const counterMarkup = renderLightDomCounter().replace(
			'</test-light-dom-counter>',
			'<aside data-eco-persist="sidebar">Sidebar</aside></test-light-dom-counter>',
		);
		document.body.innerHTML = counterMarkup;
		const liveCounter = document.querySelector('test-light-dom-counter');
		const liveIncrementButton = document.querySelector<HTMLButtonElement>('[data-ref="increment"]');
		const liveSidebar = document.querySelector('aside');

		const newDocument = parseDocument(
			`<html><head><script data-eco-rerun="true"></script></head><body>${counterMarkup}</body></html>`,
		);

		morphBody(newDocument, 'data-eco-persist');

		const nextCounter = document.querySelector('test-light-dom-counter');
		const nextIncrementButton = document.querySelector<HTMLButtonElement>('[data-ref="increment"]');
		expect(nextCounter).toBe(liveCounter);
		expect(nextIncrementButton).toBe(liveIncrementButton);
		expect(document.querySelector('aside')).toBe(liveSidebar);

		nextIncrementButton?.click();
		expect(nextCounter?.querySelector('[data-ref="count"]')?.textContent).toBe('1');
	});

	it('does not retain stale siblings when duplicate ids appear across navigations', () => {
		resetDocument();
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

		morphBody(nextDocument, 'data-eco-persist');

		expect(document.body.textContent).toContain('Ecopages JSX Integration');
		expect(document.body.textContent).not.toContain('Routing Patterns');
		expect(document.body.textContent).not.toContain('Alpha section');
		expect(document.body.textContent).not.toContain('Beta example');
		expect(document.querySelectorAll('#when-to-use')).toHaveLength(0);
		expect(document.querySelectorAll('#example')).toHaveLength(0);
	});

	it('moves a persisted light-DOM custom element into a different parent tree without duplicating it', () => {
		resetDocument();
		registerLightDomCounter();
		document.body.innerHTML = [
			'<header>',
			'<nav><ul><li>',
			renderLightDomCounter('id="toggle-dark-mode" data-eco-persist="theme-toggle" count="0"'),
			'</li></ul></nav>',
			'</header>',
			'<main>Home</main>',
		].join('');

		const currentToggle = document.querySelector('#toggle-dark-mode') as (HTMLElement & { marker?: string }) | null;
		currentToggle?.setAttribute('count', '3');
		if (currentToggle) {
			currentToggle.marker = 'kept';
		}

		const nextDocument = parseDocument(
			[
				'<html><body>',
				'<docs-shell>',
				'<div class="site-header"><nav>',
				renderLightDomCounter('id="toggle-dark-mode" data-eco-persist="theme-toggle" count="0"'),
				'</nav></div>',
				'<aside data-eco-persist="docs-sidebar">Sidebar</aside>',
				'<main>Docs</main>',
				'</docs-shell>',
				'</body></html>',
			].join(''),
		);

		morphBody(nextDocument, 'data-eco-persist');

		const toggles = document.querySelectorAll('#toggle-dark-mode');
		expect(toggles).toHaveLength(1);
		expect(toggles[0]).toBe(currentToggle);
		expect((toggles[0] as HTMLElement & { marker?: string }).marker).toBe('kept');
		expect(toggles[0]?.closest('docs-shell nav')).not.toBeNull();
		expect(document.querySelector('header')).toBeNull();
	});

	it('does not duplicate a persisted toggle when the destination wraps it in a light-DOM custom element shell', () => {
		resetDocument();
		registerLightDomCounter();
		if (!customElements.get('docs-shell')) {
			customElements.define(
				'docs-shell',
				class extends HTMLElement {
					connectedCallback() {
						this.setAttribute('data-shell', 'ready');
					}
				},
			);
		}

		document.body.innerHTML = [
			'<header class="header">',
			'<nav class="navigation"><ul><li>',
			renderLightDomCounter('id="toggle-dark-mode" data-eco-persist="theme-toggle" count="0"'),
			'</li></ul></nav>',
			'</header>',
			'<main>Home</main>',
		].join('');

		const currentToggle = document.querySelector('#toggle-dark-mode') as (HTMLElement & { marker?: string }) | null;
		if (currentToggle) {
			currentToggle.marker = 'kept';
		}

		const nextDocument = parseDocument(
			[
				'<html><body>',
				'<docs-shell class="docs-layout">',
				'<div class="site-header"><nav>',
				'<a href="https://github.com/ecopages/ecopages">GitHub</a>',
				renderLightDomCounter('id="toggle-dark-mode" data-eco-persist="theme-toggle" count="0"'),
				'</nav></div>',
				'<test-light-dom-counter data-eco-persist="docs-sidebar" count="0"><span data-ref="count">0</span></test-light-dom-counter>',
				'<main>Docs</main>',
				'</docs-shell>',
				'</body></html>',
			].join(''),
		);

		morphBody(nextDocument, 'data-eco-persist');

		expect(document.querySelectorAll('#toggle-dark-mode')).toHaveLength(1);
		expect(document.querySelector('#toggle-dark-mode')).toBe(currentToggle);
		expect(
			(document.querySelector('#toggle-dark-mode') as (HTMLElement & { marker?: string }) | null)?.marker,
		).toBe('kept');
		expect(document.querySelectorAll('[data-eco-persist="theme-toggle"]')).toHaveLength(1);
		expect(document.querySelector('header.header')).toBeNull();
	});

	it('does not duplicate a persisted toggle across layouts when replacing the body', () => {
		resetDocument();
		registerLightDomCounter();
		document.body.innerHTML = [
			'<header class="header">',
			'<nav class="navigation"><ul><li>',
			renderLightDomCounter('id="toggle-dark-mode" data-eco-persist="theme-toggle" count="0"'),
			'</li></ul></nav>',
			'</header>',
			'<main>Home</main>',
		].join('');

		const currentToggle = document.querySelector('#toggle-dark-mode') as (HTMLElement & { marker?: string }) | null;
		if (currentToggle) {
			currentToggle.marker = 'kept';
		}

		const nextDocument = parseDocument(
			[
				'<html><body>',
				'<div class="docs-layout">',
				'<div class="site-header"><nav>',
				renderLightDomCounter('id="toggle-dark-mode" data-eco-persist="theme-toggle" count="0"'),
				'</nav></div>',
				'<aside data-eco-persist="docs-sidebar">Sidebar</aside>',
				'<main>Docs</main>',
				'</div>',
				'</body></html>',
			].join(''),
		);

		morphBody(nextDocument, 'data-eco-persist');

		expect(document.querySelectorAll('#toggle-dark-mode')).toHaveLength(1);
		expect(document.querySelector('#toggle-dark-mode')).toBe(currentToggle);
		expect(
			(document.querySelector('#toggle-dark-mode') as (HTMLElement & { marker?: string }) | null)?.marker,
		).toBe('kept');
		expect(document.querySelector('header.header')).toBeNull();
	});
});

describe('morphBody on a reload of the current URL', () => {
	type Marked = HTMLElement & { marker?: string };

	function serverPage(note: string): string {
		return [
			'<main class="page">',
			`<p id="note">${note}</p>`,
			renderLightDomCounter('id="light" count="0"'),
			'<test-dsd-counter id="shadow"><template shadowrootmode="open"><span>0</span></template></test-dsd-counter>',
			'<div id="plain">plain</div>',
			'</main>',
		].join('');
	}

	function registerDsdCounter(): void {
		if (!customElements.get('test-dsd-counter')) {
			customElements.define('test-dsd-counter', class extends HTMLElement {});
		}
	}

	function startOn(html: string): ServerMarkup {
		resetDocument();
		registerLightDomCounter();
		registerDsdCounter();
		document.body.setHTMLUnsafe(html);
		const serverMarkup: ServerMarkup = new WeakMap();
		recordInitialServerMarkup(serverMarkup);
		return serverMarkup;
	}

	function touchPage(): void {
		(document.querySelector('#light') as HTMLElement).setAttribute('count', '3');
		(document.querySelector('#light') as Marked).marker = 'kept';
		const shadowCount = document.querySelector('#shadow')?.shadowRoot?.querySelector('span');
		if (shadowCount) shadowCount.textContent = '3';
		(document.querySelector('#shadow') as Marked).marker = 'kept';
		document.querySelector('#plain')?.classList.add('is-active');
		document.querySelector('main')?.classList.add('is-ready');
	}

	it('keeps elements whose server markup did not change, with their state and runtime attributes', () => {
		const serverMarkup = startOn(serverPage('v1'));
		touchPage();

		morphBody(parseDocument(`<html><body>${serverPage('v2')}</body></html>`), 'data-eco-persist', {
			serverMarkup,
			reload: true,
		});

		expect(document.querySelector('#note')?.textContent).toBe('v2');
		expect((document.querySelector('#light') as Marked).marker).toBe('kept');
		expect(document.querySelector('#light [data-ref="count"]')?.textContent).toBe('3');
		expect((document.querySelector('#shadow') as Marked).marker).toBe('kept');
		expect(document.querySelector('#shadow')?.shadowRoot?.textContent).toBe('3');
		expect(document.querySelector('#plain')?.classList.contains('is-active')).toBe(true);
		expect(document.querySelector('main')?.className).toBe('page is-ready');
	});

	it('replaces a custom element whose server markup changed', () => {
		const serverMarkup = startOn(serverPage('v1'));
		touchPage();

		const changed = serverPage('v1').replace('id="light" count="0"', 'id="light" count="1"');
		morphBody(parseDocument(`<html><body>${changed}</body></html>`), 'data-eco-persist', {
			serverMarkup,
			reload: true,
		});

		expect((document.querySelector('#light') as Marked).marker).toBeUndefined();
		expect(document.querySelector('#light [data-ref="count"]')?.textContent).toBe('1');
		expect((document.querySelector('#shadow') as Marked).marker).toBe('kept');
	});

	it('compares against the server markup of the previous reload, not the first document', () => {
		const serverMarkup = startOn(serverPage('v1'));
		const reloadTo = (html: string) =>
			morphBody(parseDocument(`<html><body>${html}</body></html>`), 'data-eco-persist', {
				serverMarkup,
				reload: true,
			});
		const changed = serverPage('v2').replace('id="light" count="0"', 'id="light" count="1"');

		reloadTo(changed);
		touchPage();
		reloadTo(changed.replace('v2', 'v3'));

		expect(document.querySelector('#note')?.textContent).toBe('v3');
		expect((document.querySelector('#light') as Marked).marker).toBe('kept');
		expect(document.querySelector('#light [data-ref="count"]')?.textContent).toBe('3');
	});

	it('replaces unchanged custom elements on navigation', () => {
		const serverMarkup = startOn(serverPage('v1'));
		touchPage();

		morphBody(parseDocument(`<html><body>${serverPage('v1')}</body></html>`), 'data-eco-persist', {
			serverMarkup,
		});

		expect((document.querySelector('#light') as Marked).marker).toBeUndefined();
		expect((document.querySelector('#shadow') as Marked).marker).toBeUndefined();
		expect(document.querySelector('#plain')?.classList.contains('is-active')).toBe(false);
	});

	it('keeps unchanged elements inside a changed parent when the page has rerun scripts', () => {
		const rerun = '<script type="module" data-eco-rerun="true" data-eco-script-id="probe"></script>';
		const serverMarkup = startOn(`${rerun}${serverPage('v1')}`);
		touchPage();

		morphBody(parseDocument(`<html><body>${rerun}${serverPage('v2')}</body></html>`), 'data-eco-persist', {
			serverMarkup,
			reload: true,
		});

		expect(document.querySelector('#note')?.textContent).toBe('v2');
		expect((document.querySelector('#light') as Marked).marker).toBe('kept');
		expect((document.querySelector('#shadow') as Marked).marker).toBe('kept');
		expect(document.querySelector('#plain')?.classList.contains('is-active')).toBe(true);
	});

	it('keeps a persisted element whose server markup changed', () => {
		const persisted = (count: string) =>
			renderLightDomCounter(`id="sidebar" data-eco-persist="sidebar" count="${count}"`);
		const serverMarkup = startOn(`${persisted('0')}${serverPage('v1')}`);
		(document.querySelector('#sidebar') as Marked).marker = 'kept';

		morphBody(parseDocument(`<html><body>${persisted('1')}${serverPage('v1')}</body></html>`), 'data-eco-persist', {
			serverMarkup,
			reload: true,
		});

		expect((document.querySelector('#sidebar') as Marked).marker).toBe('kept');
		expect(document.querySelector('#sidebar')?.getAttribute('count')).toBe('0');
	});

	it('takes the new attributes of a changed element whose own server attributes changed', () => {
		const serverMarkup = startOn(serverPage('v1'));
		touchPage();

		const changed = serverPage('v2').replace('<main class="page">', '<main class="page wide">');
		morphBody(parseDocument(`<html><body>${changed}</body></html>`), 'data-eco-persist', {
			serverMarkup,
			reload: true,
		});

		expect(document.querySelector('main')?.className).toBe('page wide');
		expect(document.querySelector('#plain')?.classList.contains('is-active')).toBe(true);
	});
});

describe('morphBody keeps the incoming custom elements', () => {
	type Engine = { name: string };
	type Seen = { tag: string; engine: Engine | undefined; shadowRoot: boolean };
	const connected: Seen[] = [];
	const disconnected: Element[] = [];

	function registerPropHosts(): void {
		if (customElements.get('test-prop-host')) return;
		for (const tag of ['test-prop-host', 'test-prop-child', 'test-prop-shadow']) {
			customElements.define(
				tag,
				class extends HTMLElement {
					declare engine: Engine | undefined;
					connectedCallback() {
						connected.push({ tag, engine: this.engine, shadowRoot: this.shadowRoot !== null });
					}
					disconnectedCallback() {
						disconnected.push(this);
					}
				},
			);
		}
	}

	function setUp(liveHtml: string): void {
		resetDocument();
		registerPropHosts();
		document.body.innerHTML = liveHtml;
		connected.length = 0;
		disconnected.length = 0;
	}

	const host = '<test-prop-host><test-prop-child></test-prop-child></test-prop-host>';

	function morphIncoming(html: string, assign: (incoming: Document) => void) {
		const incoming = parseDocument(`<html><body>${html}</body></html>`);
		assign(incoming);
		morphBody(incoming, 'data-eco-persist');
		return incoming;
	}

	it('connects an added custom element with the properties set on the incoming node', () => {
		setUp('<p>old</p>');
		const engine = { name: 'added' };
		let incomingHost: Element | null = null;
		let incomingChild: Element | null = null;

		morphIncoming(`<p>old</p>${host}`, (incoming) => {
			incomingHost = incoming.querySelector('test-prop-host');
			incomingChild = incoming.querySelector('test-prop-child');
			(incomingHost as unknown as { engine: Engine }).engine = engine;
			(incomingChild as unknown as { engine: Engine }).engine = engine;
		});

		expect(connected.map((seen) => [seen.tag, seen.engine])).toEqual([
			['test-prop-host', engine],
			['test-prop-child', engine],
		]);
		expect(document.querySelector('test-prop-host')).toBe(incomingHost);
		expect(document.querySelector('test-prop-child')).toBe(incomingChild);
	});

	it('replaces a live light-DOM host with the incoming node, preserving properties and nested identity', () => {
		setUp(`<p>before</p>${host}`);
		const oldHost = document.querySelector('test-prop-host');
		connected.length = 0;
		const engine = { name: 'deferred' };
		let incomingHost: Element | null = null;
		let incomingChild: Element | null = null;

		morphIncoming(`<p>after</p>${host}`, (incoming) => {
			incomingHost = incoming.querySelector('test-prop-host');
			incomingChild = incoming.querySelector('test-prop-child');
			(incomingHost as unknown as { engine: Engine }).engine = engine;
			(incomingChild as unknown as { engine: Engine }).engine = engine;
		});

		expect(document.querySelector('test-prop-host')).toBe(incomingHost);
		expect(document.querySelector('test-prop-child')).toBe(incomingChild);
		expect(connected.filter((seen) => seen.tag === 'test-prop-host')).toEqual([
			{ tag: 'test-prop-host', engine, shadowRoot: false },
		]);
		expect(connected.find((seen) => seen.tag === 'test-prop-child')?.engine).toBe(engine);
		expect(disconnected.filter((element) => element === oldHost)).toHaveLength(1);
	});

	it('replaces a hydrated shadow host with the incoming node and attaches its declarative shadow root', () => {
		setUp('<test-prop-shadow></test-prop-shadow>');
		const oldHost = document.querySelector('test-prop-shadow') as HTMLElement;
		oldHost.attachShadow({ mode: 'open' }).innerHTML = '<span>old</span>';
		connected.length = 0;
		const engine = { name: 'shadow' };
		let incomingHost: Element | null = null;

		morphIncoming(
			'<test-prop-shadow><template shadowrootmode="open"><span>new</span></template></test-prop-shadow>',
			(incoming) => {
				incomingHost = incoming.querySelector('test-prop-shadow');
				(incomingHost as unknown as { engine: Engine }).engine = engine;
			},
		);

		const liveHost = document.querySelector('test-prop-shadow');
		expect(liveHost).toBe(incomingHost);
		expect(connected).toEqual([{ tag: 'test-prop-shadow', engine, shadowRoot: false }]);
		expect(disconnected.filter((element) => element === oldHost)).toHaveLength(1);
		expect(liveHost?.shadowRoot?.querySelector('span')?.textContent).toBe('new');
	});

	it('refreshes a host replaced by a rerun script with the incoming node', () => {
		setUp(`<main>${host}</main>`);
		connected.length = 0;
		const engine = { name: 'rerun' };
		let incomingHost: Element | null = null;

		morphIncoming(`<main>${host}</main><script data-eco-rerun></script>`, (incoming) => {
			incomingHost = incoming.querySelector('test-prop-host');
			(incomingHost as unknown as { engine: Engine }).engine = engine;
		});

		expect(document.querySelector('test-prop-host')).toBe(incomingHost);
		expect(connected.find((seen) => seen.tag === 'test-prop-host')?.engine).toBe(engine);
	});

	it('keeps the live properties of a persisted host and ignores incoming properties on a kept element', () => {
		setUp(`<test-prop-host data-eco-persist="side"></test-prop-host><p id="plain">same</p>`);
		const liveEngine = { name: 'live' };
		const liveHost = document.querySelector('test-prop-host') as unknown as HTMLElement & { engine: Engine };
		liveHost.engine = liveEngine;
		const livePlain = document.querySelector('#plain') as Element & { marker?: string };
		livePlain.marker = 'live';

		morphIncoming(`<test-prop-host data-eco-persist="side"></test-prop-host><p id="plain">same</p>`, (incoming) => {
			(incoming.querySelector('test-prop-host') as unknown as { engine: Engine }).engine = { name: 'incoming' };
			(incoming.querySelector('#plain') as unknown as { marker: string }).marker = 'incoming';
		});

		expect(document.querySelector('test-prop-host')).toBe(liveHost);
		expect(liveHost.engine).toBe(liveEngine);
		expect(document.querySelector('#plain')).toBe(livePlain);
		expect(livePlain.marker).toBe('live');
	});
});
