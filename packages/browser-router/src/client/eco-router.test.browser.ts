import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createRouter, EcoRouter } from './eco-router';

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
		vi.restoreAllMocks();
	});

	describe('Initialization', () => {
		it('should create router instance', () => {
			router = createRouter();
			expect(router).toBeInstanceOf(EcoRouter);
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
	});

	describe('Link Interception', () => {
		describe('Internal Links', () => {
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

			fetchSpy?.mockImplementation((url, init) => {
				if (url.toString().includes('/first-page')) {
					abortSignal = init?.signal;
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
	});
});
