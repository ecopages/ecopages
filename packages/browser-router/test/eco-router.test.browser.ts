import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ECO_DOCUMENT_OWNER_ATTRIBUTE, getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import { createRouter, EcoRouter } from '../src/client/eco-router';

type BrowserRouterTestWindow = Window &
	typeof globalThis & {
		__ECO_PAGES__?: {
			navigation?: unknown;
			react?: {
				cleanupPageRoot?: () => void;
			};
			page?: unknown;
		};
		__ecopages_browser_router__?: EcoRouter;
	};

const runtimeWindow = window as BrowserRouterTestWindow;
const initialUrl = `${window.location.origin}/`;

function resetBrowserRuntimeState(): void {
	runtimeWindow.__ECO_PAGES__?.react?.cleanupPageRoot?.();
	runtimeWindow.__ecopages_browser_router__?.stop();
	delete runtimeWindow.__ecopages_browser_router__;
	if (runtimeWindow.__ECO_PAGES__) {
		delete runtimeWindow.__ECO_PAGES__.navigation;
		if (runtimeWindow.__ECO_PAGES__.react) {
			delete runtimeWindow.__ECO_PAGES__.react.cleanupPageRoot;
		}
		delete runtimeWindow.__ECO_PAGES__.page;
	}
	document.head.innerHTML = '';
	document.body.innerHTML = '';
	document.title = '';
	document.documentElement.removeAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE);
	document.documentElement.removeAttribute('data-theme');
	document.documentElement.removeAttribute('lang');
	document.documentElement.removeAttribute('dir');
	document.documentElement.className = '';
	window.history.replaceState({}, '', initialUrl);
}

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
	return new Promise((resolve, reject) => {
		const timeoutId = window.setTimeout(() => {
			document.removeEventListener(eventName, handleNavigation);
			reject(new Error(`Timed out waiting for ${eventName}`));
		}, 1000);

		const handleNavigation = () => {
			window.clearTimeout(timeoutId);
			resolve();
		};

		document.addEventListener(eventName, handleNavigation, { once: true });
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
	let user: ReturnType<typeof userEvent.setup>;
	const mockHtml = '<html><head></head><body><div id="content">New Content</div></body></html>';

	beforeEach(() => {
		resetBrowserRuntimeState();
		fetchSpy = mockFetch(mockHtml);
		user = userEvent.setup();
	});

	afterEach(() => {
		router?.stop();
		router = null;
		fetchSpy?.mockRestore();
		resetBrowserRuntimeState();
		vi.restoreAllMocks();
	});

	describe('Initialization', () => {
		it('should create router instance', () => {
			router = createRouter();
			expect(router).toBeInstanceOf(EcoRouter);
		});

		it('should reuse the active router instance across repeated createRouter calls', () => {
			const firstRouter = createRouter();
			const secondRouter = createRouter();

			router = firstRouter;
			expect(secondRouter).toBe(firstRouter);
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

		it('should allow custom html attributes to sync when configured', async () => {
			document.documentElement.setAttribute('data-theme', 'dark');
			router = createRouter({
				documentElementAttributesToSync: ['lang', 'data-theme'],
			});
			const fullMockHtml =
				'<html lang="fr" data-theme="light"><head><title>New Title</title></head><body><div id="content">New Content</div></body></html>';
			fetchSpy?.mockResolvedValueOnce({
				ok: true,
				text: async () => fullMockHtml,
			} as Response);

			await router.navigate('/custom-html-sync');

			expect(document.documentElement.getAttribute('data-theme')).toBe('light');
			expect(document.documentElement.getAttribute('lang')).toBe('fr');
		});
	});

	describe('Link Interception', () => {
		describe('Internal Links', () => {
			it('should not intercept clicks while another runtime owns navigation', () => {
				getEcoNavigationRuntime(window).claimOwnership('custom-router');
				router = createRouter();
				const link = createLink({ href: '/react-route', id: 'react-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');
				link.addEventListener('click', (e) => e.preventDefault());

				simulateClick(link);

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should delegate clicks to the active runtime instead of dropping them', async () => {
				const navigateSpy = vi.fn(async () => true);
				router = createRouter();
				const unregister = getEcoNavigationRuntime(window).register({
					owner: 'react-router',
					navigate: navigateSpy,
				});
				getEcoNavigationRuntime(window).claimOwnership('react-router');
				const link = createLink({ href: '/react-route', id: 'delegated-react-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');

				await user.click(link);
				await vi.waitFor(() => {
					expect(navigateSpy).toHaveBeenCalledWith({
						href: '/react-route',
						direction: 'forward',
						source: 'browser-router',
					});
				});

				expect(pushStateSpy).not.toHaveBeenCalled();
				unregister();
			});

			it('should keep intercepting clicks while another document owner is pending but not yet registered', async () => {
				router = createRouter();
				getEcoNavigationRuntime(window).setOwner('react-router');
				const link = createLink({ href: '/pending-react-route', id: 'pending-react-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');

				await Promise.all([waitForNavigation(), user.click(link)]);

				expect(pushStateSpy).toHaveBeenCalled();
			});

			it('should recover a rapid click from the last hovered link while navigation is in flight', async () => {
				router = createRouter();
				const firstFetch = createDeferred();
				fetchSpy?.mockImplementationOnce(
					(url: string | URL | Request, init?: RequestInit) =>
						new Promise<Response>((resolve, reject) => {
							const abortSignal = init?.signal;
							const handleAbort = () => {
								reject(new DOMException('Aborted', 'AbortError'));
							};

							abortSignal?.addEventListener('abort', handleAbort, { once: true });
							firstFetch.promise.then(() => {
								abortSignal?.removeEventListener('abort', handleAbort);
								resolve({
									ok: true,
									text: async () =>
										'<html><head></head><body><div id="content">First Content</div></body></html>',
								} as Response);
							});
						}),
				);
				fetchSpy?.mockResolvedValueOnce({
					ok: true,
					text: async () =>
						'<html><head></head><body><div id="content">Recovered Content</div></body></html>',
				} as Response);

				const firstLink = createLink({ href: '/first-route', id: 'first-link' });
				const hoveredLink = createLink({ href: '/hover-recovered-route', id: 'hovered-link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');

				await user.click(firstLink);
				await user.hover(hoveredLink);
				hoveredLink.remove();
				const navigation = waitForNavigation();
				await user.click(document.body);
				firstFetch.resolve();
				await navigation;

				expect(pushStateSpy).toHaveBeenCalledWith({}, '', expect.stringContaining('/hover-recovered-route'));
				expect(document.body.innerHTML).toContain('Recovered Content');
			});

			it('should intercept clicks on internal links', async () => {
				router = createRouter();
				const link = createLink({ href: '/test-link', id: 'link' });
				const pushStateSpy = vi.spyOn(window.history, 'pushState');

				await Promise.all([waitForNavigation(), user.click(link)]);

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
		it('should swap directly into a React-owned document when document ownership changes', async () => {
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

				expect(reloadSpy).not.toHaveBeenCalled();
				expect(pushStateSpy).toHaveBeenCalledWith({}, '', expect.stringContaining('/react-content'));
				expect(afterSwapSpy).toHaveBeenCalled();
				expect(document.documentElement.getAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE)).toBe('react-router');
				expect(document.body.innerHTML).toContain('React Route');
				expect(getEcoNavigationRuntime(window).getOwnerState().owner).toBe('react-router');
			} finally {
				document.removeEventListener('eco:after-swap', afterSwapSpy);
			}
		});

		it('should clean up the active React page root before accepting a delegated handoff to browser-router', async () => {
			router = createRouter();
			const originalDocumentOwner = document.documentElement.getAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE);
			document.documentElement.setAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE, 'react-router');
			const cleanupSpy = vi.fn();
			const unregister = getEcoNavigationRuntime(window).register({
				owner: 'react-router',
				cleanupBeforeHandoff: cleanupSpy,
			});
			getEcoNavigationRuntime(window).claimOwnership('react-router');

			const reloadSpy = vi.spyOn(
				router as EcoRouter & { reloadDocument: (url: URL) => void },
				'reloadDocument',
			) as ReturnType<typeof vi.spyOn>;
			reloadSpy.mockImplementation(() => undefined);

			try {
				const handoffDocument = new DOMParser().parseFromString(
					'<html><body><main>Outside React</main></body></html>',
					'text/html',
				);

				await getEcoNavigationRuntime(window).requestHandoff({
					href: '/outside-react',
					finalHref: '/outside-react',
					direction: 'forward',
					source: 'react-router',
					targetOwner: 'browser-router',
					document: handoffDocument,
					html: '<html><body><main>Outside React</main></body></html>',
				});

				expect(cleanupSpy).toHaveBeenCalledTimes(1);
				expect(reloadSpy).not.toHaveBeenCalled();
				expect(document.body.innerHTML).toContain('Outside React');
				expect(getEcoNavigationRuntime(window).getOwnerState().owner).toBe('browser-router');
			} finally {
				if (originalDocumentOwner) {
					document.documentElement.setAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE, originalDocumentOwner);
				} else {
					document.documentElement.removeAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE);
				}
				unregister();
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
			const requestAnimationFrameSpy = vi
				.spyOn(window, 'requestAnimationFrame')
				.mockImplementation((callback: FrameRequestCallback): number => {
					callback(performance.now());
					return 1;
				});
			document.addEventListener('eco:page-load', pageLoadSpy);

			try {
				await router.navigate('/event-test');
				expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
				expect(pageLoadSpy).toHaveBeenCalledTimes(1);
			} finally {
				document.removeEventListener('eco:page-load', pageLoadSpy);
				requestAnimationFrameSpy.mockRestore();
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

		it('should silently ignore stale navigation failures that surface as generic fetch errors', async () => {
			router = createRouter();
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			fetchSpy?.mockImplementation((url: string | URL | Request, init?: RequestInit) => {
				if (url.toString().includes('/first-page')) {
					return new Promise((_, reject) => {
						init?.signal?.addEventListener('abort', () => reject(new TypeError('Failed to fetch')), {
							once: true,
						});
					});
				}

				return Promise.resolve({
					ok: true,
					text: async () => '<html><body>Second</body></html>',
				} as Response);
			});

			void router.navigate('/first-page');
			await new Promise((resolve) => setTimeout(resolve, 10));
			await router.navigate('/second-page');

			expect(consoleSpy).not.toHaveBeenCalled();
			expect(document.body.innerHTML).toContain('Second');
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

		it('should abort in-flight browser-router navigation when the coordinator cleans it up for handoff', async () => {
			router = createRouter({ viewTransitions: false });
			const slowPage = createDeferred();

			fetchSpy?.mockImplementation((url: string | URL | Request, init?: RequestInit) => {
				if (url.toString().includes('/slow-page')) {
					return new Promise<Response>((resolve, reject) => {
						init?.signal?.addEventListener(
							'abort',
							() => reject(new DOMException('Aborted', 'AbortError')),
							{
								once: true,
							},
						);
						slowPage.promise.then(() => {
							resolve({
								ok: true,
								text: async () => '<html><body><div id="content">Slow Content</div></body></html>',
							} as Response);
						});
					});
				}

				return Promise.resolve({
					ok: true,
					text: async () => '<html><body><div id="content">Fast Content</div></body></html>',
				} as Response);
			});

			const slowNavigation = router.navigate('/slow-page');
			await new Promise((resolve) => setTimeout(resolve, 10));
			await getEcoNavigationRuntime(window).cleanupOwner('browser-router');
			slowPage.resolve();
			await slowNavigation;

			expect(document.body.innerHTML).not.toContain('Slow Content');
		});
	});
});
