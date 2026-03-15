import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
	ECO_DOCUMENT_OWNER_ATTRIBUTE,
	getEcoNavigationRuntime,
} from '@ecopages/core/router/navigation-coordinator';
import { createRouter, EcoRouter } from '../src/client/eco-router';

type BrowserRouterTestWindow = Window &
	typeof globalThis & {
		__ecopages_cleanup_page_root__?: () => void;
	};

const runtimeWindow = window as BrowserRouterTestWindow;

function mockFetch(htmlContent: string) {
	return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
		ok: true,
		text: async () => htmlContent,
	} as Response);
}

function createLink(attributes: Record<string, string>): HTMLAnchorElement {
	const link = document.createElement('a');
	for (const [key, value] of Object.entries(attributes)) {
		link.setAttribute(key, value);
	}
	link.textContent = 'Test Link';
	document.body.appendChild(link);
	return link;
}

function simulateClick(element: HTMLElement, options: Partial<MouseEventInit> = {}): void {
	const event = new MouseEvent('click', {
		bubbles: true,
		cancelable: true,
		composed: true,
		button: 0,
		...options,
	});
	element.dispatchEvent(event);
}

async function waitForNavigation(eventName = 'eco:after-swap'): Promise<void> {
	return new Promise((resolve) => {
		document.addEventListener(eventName, () => resolve(), { once: true });
		// Fallback for cases where the event might not fire (e.g. error or already handled)
		setTimeout(resolve, 100);
	});
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	const promise = new Promise<void>((innerResolve) => {
		resolve = innerResolve;
	});
	return { promise, resolve };
}

describe('EcoRouter', () => {
	let router: EcoRouter | null = null;
	let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;
	const mockHtml = '<html><head></head><body><div id="content">New Content</div></body></html>';

	beforeEach(() => {
		document.body.innerHTML = '';
		fetchSpy = mockFetch(mockHtml);
	});

	afterEach(() => {
		router?.stop();
		router = null;
		fetchSpy?.mockRestore();
		delete runtimeWindow.__ecopages_cleanup_page_root__;
		vi.restoreAllMocks();
	});

	describe('Initialization', () => {
		it('should create router instance', () => {
			router = createRouter();
			expect(router).toBeInstanceOf(EcoRouter);
		});

		it('should register and clean up browser-router navigation through the coordinator', () => {
			router = new EcoRouter();
			router.start();

			expect(getEcoNavigationRuntime(window).getOwnerState()).toEqual({
				owner: 'browser-router',
				canHandleSpaNavigation: true,
			});

			router.stop();

			expect(getEcoNavigationRuntime(window).getOwnerState()).toEqual({
				owner: 'none',
				canHandleSpaNavigation: false,
			});
		});

		it('should start and stop without errors', () => {
			router = new EcoRouter();
			expect(() => router!.start()).not.toThrow();
			expect(() => router!.stop()).not.toThrow();
		});
	});

	describe('Programmatic Navigation', () => {
		it('should navigate and update history with pushState', async () => {
			router = createRouter();
			const pushStateSpy = vi.spyOn(window.history, 'pushState');

			await router.navigate('/new-page');

			expect(pushStateSpy).toHaveBeenCalledWith({}, '', expect.stringContaining('/new-page'));
			expect(document.body.innerHTML).toContain('New Content');
		});

		it('should use replaceState when replace option is true', async () => {
			router = createRouter();
			const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

			await router.navigate('/replaced-page', { replace: true });

			expect(replaceStateSpy).toHaveBeenCalledWith({}, '', expect.stringContaining('/replaced-page'));
		});
	});

	describe('DOM Updates', () => {
		it('should update both head and body content', async () => {
			router = createRouter();
			const fullMockHtml =
				'<html><head><title>New Title</title></head><body><div id="content">New Content</div></body></html>';
			fetchSpy?.mockResolvedValueOnce({
				ok: true,
				text: async () => fullMockHtml,
			} as Response);

			await router.navigate('/full-update');

			expect(document.title).toBe('New Title');
			expect(document.body.innerHTML).toContain('New Content');
		});

		it('should preserve multiple body elements if using replaceBody', async () => {
			router = createRouter({ viewTransitions: false });
			const multiElementHtml = '<html><body><nav>Nav</nav><main>Main</main><footer>Footer</footer></body></html>';
			fetchSpy?.mockResolvedValueOnce({
				ok: true,
				text: async () => multiElementHtml,
			} as Response);

			await router.navigate('/multi-element');

			expect(document.body.innerHTML).toContain('<nav>Nav</nav>');
			expect(document.body.innerHTML).toContain('<main>Main</main>');
			expect(document.body.innerHTML).toContain('<footer>Footer</footer>');
		});

		it('should replace hydrated shadow-DOM custom elements so incoming state wins', async () => {
			if (!customElements.get('test-shadow-counter')) {
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
						if (!this.shadowRoot) return;
						this.shadowRoot.innerHTML = `<span data-shadow-count>${this.getAttribute('count') ?? '0'}</span>`;
					}
				}

				customElements.define('test-shadow-counter', TestShadowCounter);
			}

			document.body.innerHTML = '<test-shadow-counter count="0"></test-shadow-counter>';
			const currentCounter = document.querySelector('test-shadow-counter') as HTMLElement | null;
			currentCounter?.setAttribute('count', '5');

			router = createRouter();
			fetchSpy?.mockResolvedValueOnce({
				ok: true,
				text: async () => '<html><body><test-shadow-counter count="0"></test-shadow-counter></body></html>',
			} as Response);

			await router.navigate('/shadow-reset');

			const nextCounter = document.querySelector('test-shadow-counter') as HTMLElement | null;
			expect(nextCounter).not.toBeNull();
			expect(nextCounter).not.toBe(currentCounter);
			expect(nextCounter?.shadowRoot?.querySelector('[data-shadow-count]')?.textContent).toBe('0');
		});

		it('should flush rerun scripts after the new body is in place', async () => {
			router = createRouter({ viewTransitions: false });
			const rerunHtml = [
				'<html>',
					'<head>',
						'<script data-eco-rerun="true" data-eco-script-id="after-body-rerun">',
							'document.body.setAttribute("data-rerun-target",document.querySelector("#content")?.textContent??"missing")',
						'</script>',
					'</head>',
					'<body><div id="content">New Content</div></body>',
				'</html>',
			].join('');
			fetchSpy?.mockResolvedValueOnce({
				ok: true,
				text: async () => rerunHtml,
			} as Response);

			await router.navigate('/rerun-after-body');
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(document.body.getAttribute('data-rerun-target')).toBe('New Content');
			expect(document.querySelectorAll('script[data-eco-script-id="after-body-rerun"]')).toHaveLength(1);
		});

		it('should re-execute external module rerun scripts with a fresh URL', async () => {
			router = createRouter({ viewTransitions: false });
			const rerunHtml = [
				'<html>',
					'<head>',
						'<script type="module" src="/assets/counter.js" data-eco-rerun="true"></script>',
					'</head>',
					'<body><div id="content">Counter Page</div></body>',
				'</html>',
			].join('');

			fetchSpy?.mockResolvedValueOnce({
				ok: true,
				text: async () => rerunHtml,
			} as Response);

			const observedSrcs: string[] = [];
			const originalAppendChild = document.head.appendChild.bind(document.head);
			const appendChildSpy = vi
				.spyOn(document.head, 'appendChild')
				.mockImplementation(((node: Node) => {
					if (node instanceof HTMLScriptElement && node.getAttribute('data-eco-rerun') !== 'true') {
						observedSrcs.push(node.getAttribute('src') ?? '');
					}
					return originalAppendChild(node);
				}) as typeof document.head.appendChild);

			await router.navigate('/plain-counter');
			await waitForNavigation();

			fetchSpy?.mockResolvedValueOnce({
				ok: true,
				text: async () => rerunHtml,
			} as Response);

			await router.navigate('/plain-counter-again');
			await waitForNavigation();

			const finalScript = document.head.querySelector<HTMLScriptElement>('script[src*="/assets/counter.js"]');

			expect(observedSrcs[0]).toContain('__eco_rerun=1');
			expect(finalScript).not.toBeNull();
			expect(finalScript?.getAttribute('src')).toContain('__eco_rerun=2');
			expect(document.head.querySelectorAll('script[src*="/assets/counter.js"]')).toHaveLength(1);

			appendChildSpy.mockRestore();
		});
	});

	describe('Link Interception', () => {
		describe('Internal Links', () => {
			it('should not intercept clicks while React router owns navigation', () => {
				getEcoNavigationRuntime(window).setOwner('react-router');
				router = createRouter();
				const link = createLink({ href: '/react-route', id: 'react-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link);

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should intercept clicks on internal links', async () => {
				router = createRouter();
				const link = createLink({ href: '/test-link', id: 'link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');

				simulateClick(link);
				await waitForNavigation();

				expect(pushStateSpy).toHaveBeenCalled();
			});

			it('should intercept clicks on relative path links', async () => {
				router = createRouter();
				const link = createLink({ href: 'relative/path', id: 'rel-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');

				simulateClick(link);
				await waitForNavigation();

				expect(pushStateSpy).toHaveBeenCalled();
			});

			it('should intercept clicks on links with query parameters', async () => {
				router = createRouter();
				const link = createLink({ href: '/page?foo=bar&baz=qux', id: 'query-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');

				simulateClick(link);
				await waitForNavigation();

				expect(pushStateSpy).toHaveBeenCalledWith({}, '', expect.stringContaining('/page?foo=bar&baz=qux'));
			});

			it('should intercept clicks on same-origin absolute URLs', async () => {
				router = createRouter();
				const link = createLink({ href: `${window.location.origin}/absolute-path`, id: 'abs-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');

				simulateClick(link);
				await waitForNavigation();

				expect(pushStateSpy).toHaveBeenCalled();
			});

			it('should intercept clicks on nested anchor elements', async () => {
				router = createRouter();
				const link = createLink({ href: '/nested-test', id: 'nested-link' });
				const span = document.createElement('span');
				span.textContent = 'Click me';
				link.innerHTML = '';
				link.appendChild(span);
				const pushStateSpy = vi.spyOn(window.history, 'pushState');

				simulateClick(span);
				await waitForNavigation();

				expect(pushStateSpy).toHaveBeenCalled();
			});

			it('should intercept clicks on links inside Shadow DOM', async () => {
				router = createRouter();
				const host = document.createElement('div');
				host.id = 'shadow-host';
				document.body.appendChild(host);
				const shadow = host.attachShadow({ mode: 'open' });
				const link = document.createElement('a');
				link.href = '/shadow-link';
				link.textContent = 'Shadow Link';
				shadow.appendChild(link);

				const pushStateSpy = vi.spyOn(window.history, 'pushState');

				simulateClick(link);
				await waitForNavigation();

				expect(pushStateSpy).toHaveBeenCalled();
			});
		});

		describe('External Links (should NOT intercept)', () => {
			it('should NOT intercept external links', () => {
				router = createRouter();
				const link = createLink({ href: 'https://example.com', id: 'ext-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link);

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should NOT intercept cross-origin links with different port', () => {
				router = createRouter();
				const link = createLink({ href: 'http://localhost:9999/different-port', id: 'port-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link);

				expect(pushStateSpy).not.toHaveBeenCalled();
			});
		});

		describe('Link Attributes (should NOT intercept)', () => {
			it('should NOT intercept links with target="_blank"', () => {
				router = createRouter();
				const link = createLink({ href: '/page', target: '_blank', id: 'blank-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link);

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should NOT intercept links with target="_parent"', () => {
				router = createRouter();
				const link = createLink({ href: '/page', target: '_parent', id: 'parent-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link);

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should NOT intercept links with target="_top"', () => {
				router = createRouter();
				const link = createLink({ href: '/page', target: '_top', id: 'top-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link);

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should intercept links with target="_self"', async () => {
				router = createRouter();
				const link = createLink({ href: '/page', target: '_self', id: 'self-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');

				simulateClick(link);
				await waitForNavigation();

				expect(pushStateSpy).toHaveBeenCalled();
			});

			it('should NOT intercept links with download attribute', () => {
				router = createRouter();
				const link = createLink({ href: '/file.pdf', download: '', id: 'dl-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link);

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should NOT intercept links with download attribute and filename', () => {
				router = createRouter();
				const link = createLink({ href: '/file.pdf', download: 'custom-name.pdf', id: 'dl-named-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link);

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should NOT intercept links with data-eco-reload attribute', () => {
				router = createRouter();
				const link = createLink({ href: '/reload', 'data-eco-reload': '', id: 'reload-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link);

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should NOT intercept links without href attribute', () => {
				router = createRouter();
				const link = document.createElement('a');
				link.id = 'no-href-link';
				link.textContent = 'No href';
				document.body.appendChild(link);
				const pushStateSpy = vi.spyOn(window.history, 'pushState');

				simulateClick(link);

				expect(pushStateSpy).not.toHaveBeenCalled();
			});
		});

		describe('Special href Values (should NOT intercept)', () => {
			it('should NOT intercept hash-only links', () => {
				router = createRouter();
				const link = createLink({ href: '#section', id: 'hash-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link);

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should NOT intercept javascript: links', () => {
				router = createRouter();
				const link = createLink({ href: 'javascript:void(0)', id: 'js-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');

				simulateClick(link);

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should NOT intercept mailto: links', () => {
				router = createRouter();
				const link = createLink({ href: 'mailto:test@example.com', id: 'mailto-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link);

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should NOT intercept tel: links', () => {
				router = createRouter();
				const link = createLink({ href: 'tel:+1234567890', id: 'tel-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link);

				expect(pushStateSpy).not.toHaveBeenCalled();
			});
		});

		describe('Modifier Keys (should NOT intercept)', () => {
			it('should NOT intercept clicks with metaKey (Cmd on Mac)', () => {
				router = createRouter();
				const link = createLink({ href: '/page', id: 'meta-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link, { metaKey: true });

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should NOT intercept clicks with ctrlKey', () => {
				router = createRouter();
				const link = createLink({ href: '/page', id: 'ctrl-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link, { ctrlKey: true });

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should NOT intercept clicks with shiftKey', () => {
				router = createRouter();
				const link = createLink({ href: '/page', id: 'shift-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link, { shiftKey: true });

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should NOT intercept clicks with altKey', () => {
				router = createRouter();
				const link = createLink({ href: '/page', id: 'alt-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link, { altKey: true });

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should NOT intercept middle mouse button clicks', () => {
				router = createRouter();
				const link = createLink({ href: '/page', id: 'middle-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link, { button: 1 });

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should NOT intercept right mouse button clicks', () => {
				router = createRouter();
				const link = createLink({ href: '/page', id: 'right-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link, { button: 2 });

				expect(pushStateSpy).not.toHaveBeenCalled();
			});
		});

		describe('Custom Link Selector', () => {
			it('should only intercept links matching custom selector', async () => {
				router = createRouter({ linkSelector: 'a.router-link' });
				const regularLink = createLink({ href: '/regular', id: 'regular' });
				const routerLink = createLink({ href: '/router', id: 'router', class: 'router-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				regularLink.addEventListener('click', (e) => e.preventDefault());

				simulateClick(regularLink);
				expect(pushStateSpy).not.toHaveBeenCalled();

				simulateClick(routerLink);
				await waitForNavigation();
				expect(pushStateSpy).toHaveBeenCalled();
			});

			it('should work with data attribute selector', async () => {
				router = createRouter({ linkSelector: 'a[data-router]' });
				const link = createLink({ href: '/data-router', 'data-router': '', id: 'data-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');

				simulateClick(link);
				await waitForNavigation();

				expect(pushStateSpy).toHaveBeenCalled();
			});
		});

		describe('Custom Reload Attribute', () => {
			it('should respect custom reload attribute', () => {
				router = createRouter({ reloadAttribute: 'data-full-reload' });
				const link = createLink({ href: '/reload', 'data-full-reload': '', id: 'custom-reload' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link);

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should intercept links with default reload attribute when custom is set', async () => {
				router = createRouter({ reloadAttribute: 'data-full-reload' });
				const link = createLink({ href: '/reload', 'data-eco-reload': '', id: 'default-reload' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');

				simulateClick(link);
				await waitForNavigation();

				expect(pushStateSpy).toHaveBeenCalled();
			});
		});
	});

	describe('Lifecycle Events', () => {
		it('should force a full navigation when document ownership changes', async () => {
			router = createRouter();
			const reactHtml = [
					`<html ${ECO_DOCUMENT_OWNER_ATTRIBUTE}="react-router">`,
					'<head>',
					'</head>',
					'<body><main>React Route</main></body>',
				'</html>',
			].join('');
			fetchSpy?.mockResolvedValueOnce({
				ok: true,
				text: async () => reactHtml,
			} as Response);

			const reloadSpy = vi.spyOn(
				router as EcoRouter & { reloadDocument: (url: URL) => void },
				'reloadDocument',
			) as ReturnType<typeof vi.spyOn>;
			reloadSpy.mockImplementation(() => undefined);
			const pushStateSpy = vi.spyOn(window.history, 'pushState');
			const afterSwapSpy = vi.fn();
			document.addEventListener('eco:after-swap', afterSwapSpy);

			try {
				await router.navigate('/react-content');

				expect(reloadSpy).toHaveBeenCalledWith(expect.any(URL));
				expect(pushStateSpy).not.toHaveBeenCalled();
				expect(afterSwapSpy).not.toHaveBeenCalled();
				expect(document.body.innerHTML).not.toContain('React Route');
			} finally {
				document.removeEventListener('eco:after-swap', afterSwapSpy);
			}
		});

		it('should clean up the active React page root before reloading to a non-React route', async () => {
			router = createRouter();
				const originalDocumentOwner = document.documentElement.getAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE);
				document.documentElement.setAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE, 'react-router');
			const cleanupSpy = vi.fn();
			runtimeWindow.__ecopages_cleanup_page_root__ = cleanupSpy;
			fetchSpy?.mockResolvedValueOnce({
				ok: true,
				text: async () => '<html><body><main>Outside React</main></body></html>',
			} as Response);

			const reloadSpy = vi.spyOn(
				router as EcoRouter & { reloadDocument: (url: URL) => void },
				'reloadDocument',
			) as ReturnType<typeof vi.spyOn>;
			reloadSpy.mockImplementation(() => undefined);

			try {
				await router.navigate('/outside-react');

				expect(cleanupSpy).toHaveBeenCalledTimes(1);
				expect(reloadSpy).toHaveBeenCalledWith(expect.any(URL));
				expect(cleanupSpy.mock.invocationCallOrder[0]).toBeLessThan(reloadSpy.mock.invocationCallOrder[0]);
			} finally {
					if (originalDocumentOwner) {
						document.documentElement.setAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE, originalDocumentOwner);
					} else {
						document.documentElement.removeAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE);
					}
			}
		});

		it('should dispatch eco:before-swap event', async () => {
			router = createRouter();
			const beforeSwapSpy = vi.fn();
			document.addEventListener('eco:before-swap', beforeSwapSpy);

			try {
				await router.navigate('/event-test');
				expect(beforeSwapSpy).toHaveBeenCalledTimes(1);
			} finally {
				document.removeEventListener('eco:before-swap', beforeSwapSpy);
			}
		});

		it('should dispatch eco:after-swap event', async () => {
			router = createRouter();
			const afterSwapSpy = vi.fn();
			document.addEventListener('eco:after-swap', afterSwapSpy);

			try {
				await router.navigate('/event-test');
				expect(afterSwapSpy).toHaveBeenCalledTimes(1);
			} finally {
				document.removeEventListener('eco:after-swap', afterSwapSpy);
			}
		});

		it('should dispatch eco:page-load event after animation frame', async () => {
			router = createRouter();
			const pageLoadSpy = vi.fn();
			document.addEventListener('eco:page-load', pageLoadSpy);

			try {
				await router.navigate('/event-test');
				await new Promise((resolve) => requestAnimationFrame(resolve));
				expect(pageLoadSpy).toHaveBeenCalled();
			} finally {
				document.removeEventListener('eco:page-load', pageLoadSpy);
			}
		});

		it('should provide event details with url and direction', async () => {
			router = createRouter();
			let eventDetail: { url: URL; direction: string } | null = null;

			const handler = (e: Event) => {
				eventDetail = (e as CustomEvent).detail;
			};
			document.addEventListener('eco:after-swap', handler);

			try {
				await router.navigate('/detail-test');

				expect(eventDetail).not.toBeNull();
				expect(eventDetail!.url).toBeInstanceOf(URL);
				expect(eventDetail!.direction).toBe('forward');
			} finally {
				document.removeEventListener('eco:after-swap', handler);
			}
		});

		it('should provide newDocument in before-swap event', async () => {
			router = createRouter();
			let beforeSwapDetail: { newDocument: Document } | null = null;

			const handler = (e: Event) => {
				beforeSwapDetail = (e as CustomEvent).detail;
			};
			document.addEventListener('eco:before-swap', handler);

			try {
				await router.navigate('/before-swap-test');

				expect(beforeSwapDetail).not.toBeNull();
				expect(beforeSwapDetail!.newDocument).toBeInstanceOf(Document);
			} finally {
				document.removeEventListener('eco:before-swap', handler);
			}
		});

		it('should provide reload function in before-swap event', async () => {
			router = createRouter();
			let reloadFn: Function | null = null;

			const handler = (e: Event) => {
				reloadFn = (e as CustomEvent).detail.reload;
			};
			document.addEventListener('eco:before-swap', handler);

			try {
				await router.navigate('/reload-test');
				expect(typeof reloadFn).toBe('function');
			} finally {
				document.removeEventListener('eco:before-swap', handler);
			}
		});
	});

	describe('History Management', () => {
		it('should update history by default', async () => {
			router = createRouter();
			const pushStateSpy = vi.spyOn(window.history, 'pushState');

			await router.navigate('/history-test');

			expect(pushStateSpy).toHaveBeenCalled();
		});

		it('should not update history when updateHistory is false', async () => {
			router = createRouter({ updateHistory: false });
			const pushStateSpy = vi.spyOn(window.history, 'pushState');
			const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

			await router.navigate('/no-history-test');

			expect(pushStateSpy).not.toHaveBeenCalled();
			expect(replaceStateSpy).not.toHaveBeenCalled();
		});

		it('should handle popstate events for back/forward navigation', async () => {
			router = createRouter();
			const fetchCalled = new Promise((resolve) => {
				fetchSpy?.mockImplementationOnce(async () => {
					resolve(true);
					return {
						ok: true,
						text: async () => '<html><body>Popstate Content</body></html>',
					} as Response;
				});
			});

			window.history.pushState({}, '', '/popstate-test');

			window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
			await fetchCalled;
			await waitForNavigation();

			expect(document.body.innerHTML).toContain('Popstate Content');
		});
	});

	describe('Error Handling', () => {
		it('should silently handle aborted navigation', async () => {
			router = createRouter();
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const abortError = new Error('Aborted');
			abortError.name = 'AbortError';
			fetchSpy?.mockRejectedValueOnce(abortError);

			await router.navigate('/abort-test');

			expect(consoleSpy).not.toHaveBeenCalled();
			consoleSpy.mockRestore();
		});
	});

	describe('Navigation Abort', () => {
		it('should abort previous fetch when new navigation starts', async () => {
			router = createRouter();

			let abortSignal: AbortSignal | undefined;

			fetchSpy?.mockImplementation((url: string | URL | Request, init?: RequestInit) => {
				if (url.toString().includes('/first-page')) {
					abortSignal = init?.signal ?? undefined;
					return new Promise(() => {});
				}
				return Promise.resolve({
					ok: true,
					text: async () => '<html><body>Second</body></html>',
				} as Response);
			});

			router.navigate('/first-page');
			await new Promise((r) => setTimeout(r, 10));

			expect(abortSignal?.aborted).toBe(false);

			await router.navigate('/second-page');

			expect(abortSignal?.aborted).toBe(true);
		});

		it('should ignore stale DOM swaps when a newer navigation finishes first', async () => {
			router = createRouter({ viewTransitions: false });
			const slowStylesheets = createDeferred();
			const afterSwapSpy = vi.fn();
			document.addEventListener('eco:after-swap', afterSwapSpy);

			fetchSpy?.mockImplementation((url: string | URL | Request) => {
				if (url.toString().includes('/slow-page')) {
					return Promise.resolve({
						ok: true,
						text: async () => '<html><body><div id="content">Slow Content</div></body></html>',
					} as Response);
				}

				return Promise.resolve({
					ok: true,
					text: async () => '<html><body><div id="content">Fast Content</div></body></html>',
				} as Response);
			});

			const routerWithInternals = router as unknown as {
				domSwapper: { preloadStylesheets: (doc: Document) => Promise<void> };
			};
			const preloadSpy = vi.spyOn(routerWithInternals.domSwapper, 'preloadStylesheets');
			preloadSpy.mockImplementation(async (doc: Document) => {
				if (doc.body.textContent?.includes('Slow Content')) {
					await slowStylesheets.promise;
				}
			});

			const slowNavigation = router.navigate('/slow-page');
			await new Promise((resolve) => setTimeout(resolve, 0));
			await router.navigate('/fast-page');
			slowStylesheets.resolve();
			await slowNavigation;

			try {
				expect(document.body.innerHTML).toContain('Fast Content');
				expect(document.body.innerHTML).not.toContain('Slow Content');
				expect(afterSwapSpy).toHaveBeenCalledTimes(1);
			} finally {
				document.removeEventListener('eco:after-swap', afterSwapSpy);
			}
		});
	});
});
