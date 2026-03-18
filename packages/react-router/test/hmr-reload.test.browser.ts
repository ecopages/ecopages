import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import { EcoRouter, PageContent } from '../src/router';

function createMockPageComponent(name: string) {
	const Component = () => createElement('div', { 'data-testid': name }, `Page: ${name}`);
	Component.displayName = name;
	return Component;
}

function createLayoutAwarePage(name: string) {
	const Layout = ({
		children,
		locals,
	}: {
		children: ReactNode;
		locals?: { session?: { user?: { name?: string } } };
	}) =>
		createElement(
			'div',
			{ 'data-testid': `${name}-layout` },
			`${locals?.session?.user?.name ?? 'anonymous'}`,
			children,
		);

	const Page = ((_props: { locals?: { session?: { user?: { name?: string } } } }) =>
		createElement('div', { 'data-testid': `${name}-page` }, name)) as ReturnType<typeof createMockPageComponent> & {
		config?: { layout?: typeof Layout };
	};

	Page.displayName = name;
	Page.config = { layout: Layout };
	return Page;
}

function createMultiLinkPage(name: string, links: Array<{ href: string; label: string }>) {
	const Component = () =>
		createElement(
			'div',
			{ 'data-testid': `${name}-page` },
			...links.map((link) =>
				createElement(
					'a',
					{ key: link.href, href: link.href, 'data-testid': `${name}-${link.label}` },
					link.label,
				),
			),
		);
	Component.displayName = name;
	return Component;
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	const promise = new Promise<void>((innerResolve) => {
		resolve = innerResolve;
	});
	return { promise, resolve };
}

describe('EcoRouter HMR Integration', () => {
	let container: HTMLDivElement;
	let root: ReturnType<typeof createRoot>;
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		user = userEvent.setup();
	});

	afterEach(() => {
		if (root) {
			root.unmount();
		}
		if (container && container.parentNode) {
			container.parentNode.removeChild(container);
		}
		vi.restoreAllMocks();
		delete window.__ECO_PAGES__;
	});

	it('sets and clears the router ownership flag', async () => {
		const PageA = createMockPageComponent('PageA');

		root = createRoot(container);
		root.render(
			createElement(EcoRouter, {
				page: PageA,
				pageProps: {},
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(getEcoNavigationRuntime(window).getOwnerState().owner).toBe('react-router');

		root.unmount();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(getEcoNavigationRuntime(window).getOwnerState().owner).toBe('none');
	});

	describe('HMR reload hook registration', () => {
		it('registers current-page reload through the navigation coordinator', async () => {
			const PageA = createMockPageComponent('PageA');

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: PageA,
					pageProps: {},
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(getEcoNavigationRuntime(window).getOwnerState()).toEqual({
				owner: 'react-router',
				canHandleSpaNavigation: true,
			});
		});

		it('cleans up the registered current-page reload handler on unmount', async () => {
			const PageA = createMockPageComponent('PageA');

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: PageA,
					pageProps: {},
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));
			expect(getEcoNavigationRuntime(window).getOwnerState().owner).toBe('react-router');

			root.unmount();
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(getEcoNavigationRuntime(window).getOwnerState()).toEqual({
				owner: 'none',
				canHandleSpaNavigation: false,
			});
		});

		it('reloads the current page through the navigation coordinator', async () => {
			const PageA = createMockPageComponent('PageA');
			const moduleUrl = new URL('./fixtures/reloaded-page.tsx', import.meta.url).toString();
			const mockHtml = `
				<html>
					<body>
						<script id="__ECO_PAGE_DATA__" type="application/json">{}</script>
						<script type="module">window.__ECO_PAGES__=window.__ECO_PAGES__||{};window.__ECO_PAGES__.page={module:'${moduleUrl}',props:{}};import Page from '${moduleUrl}'; hydrateRoot(document, Page);</script>
					</body>
				</html>
			`;
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(mockHtml, { status: 200 }));

			root = createRoot(container);

			root.render(
				createElement(EcoRouter, {
					page: PageA,
					pageProps: {},
					options: { viewTransitions: false },
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));
			const result = getEcoNavigationRuntime(window).reloadCurrentPage({ clearCache: false });

			expect(result).toBeInstanceOf(Promise);
			await expect(result).resolves.toBe(true);
		});

		it('ignores coordinator reloads while a navigation is still in flight', async () => {
			const Page = createMultiLinkPage('BusyPage', [{ href: '/next', label: 'next-link' }]);
			let resolveFetch!: (response: Response) => void;
			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
				() =>
					new Promise<Response>((resolve) => {
						resolveFetch = resolve;
					}),
			);

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: Page,
					pageProps: {},
					options: { viewTransitions: false },
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));
			const link = container.querySelector('[data-testid="BusyPage-next-link"]') as HTMLAnchorElement | null;
			expect(link).not.toBeNull();
			await user.click(link as HTMLAnchorElement);

			await new Promise((resolve) => setTimeout(resolve, 0));
			const reloadResult = await getEcoNavigationRuntime(window).reloadCurrentPage({ clearCache: false });

			expect(reloadResult).toBe(true);
			expect(fetchSpy).toHaveBeenCalledTimes(1);

			resolveFetch(new Response('<html><body><main>Done</main></body></html>', { status: 200 }));
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		it('passes locals to layouts when persistLayouts is disabled', async () => {
			const Page = createLayoutAwarePage('PageWithLocals');

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: Page,
					pageProps: { locals: { session: { user: { name: 'Andee' } } } },
					options: { persistLayouts: false },
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(container.textContent).toContain('Andee');
		});

		it('passes locals to layouts when persistLayouts is enabled', async () => {
			const Page = createLayoutAwarePage('PageWithPersistentLocals');

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: Page,
					pageProps: { locals: { session: { user: { name: 'Andee' } } } },
					options: { persistLayouts: true },
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(container.textContent).toContain('Andee');
		});

		it('delegates non-React documents to browser-router when it is registered', async () => {
			const Page = createMultiLinkPage('LeaveReact', [{ href: '/outside-react', label: 'outside-link' }]);
			const cleanupSpy = vi.fn();
			const handoffSpy = vi.fn(async () => true);
			window.__ECO_PAGES__ = {
				...window.__ECO_PAGES__,
				react: {
					...window.__ECO_PAGES__?.react,
					cleanupPageRoot: cleanupSpy,
				},
			};
			const unregister = getEcoNavigationRuntime(window).register({
				owner: 'browser-router',
				handoffNavigation: handoffSpy,
			});

			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response('<html><body><main>Outside React</main></body></html>', { status: 200 }),
			);

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: Page,
					pageProps: {},
					options: { viewTransitions: false },
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));
			const link = container.querySelector('[data-testid="LeaveReact-outside-link"]') as HTMLAnchorElement | null;
			expect(link).not.toBeNull();
			await user.click(link as HTMLAnchorElement);

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(cleanupSpy).not.toHaveBeenCalled();
			expect(handoffSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					href: '/outside-react',
					finalHref: '/outside-react',
					direction: 'forward',
					source: 'react-router',
					targetOwner: 'browser-router',
					document: expect.any(Document),
					html: '<html><body><main>Outside React</main></body></html>',
				}),
			);
			unregister();
		});

		it('unregisters the react-router runtime during cleanup-before-handoff', async () => {
			const Page = createMockPageComponent('PageA');
			const events: Array<{ type: string; owner?: string; status?: string }> = [];
			const runtime = getEcoNavigationRuntime(window);
			const unsubscribe = runtime.subscribe((event) => {
				events.push(event);
			});

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: Page,
					pageProps: {},
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));
			await runtime.cleanupOwner('react-router');

			expect(runtime.getOwnerState()).toEqual({
				owner: 'none',
				canHandleSpaNavigation: false,
			});
			expect(
				events.some(
					(event) =>
						event.type === 'registration-change' &&
						event.owner === 'react-router' &&
						event.status === 'unregistered',
				),
			).toBe(true);

			const fetchSpy = vi
				.spyOn(globalThis, 'fetch')
				.mockResolvedValue(new Response('<html></html>', { status: 200 }));
			const handled = await runtime.requestNavigation({ href: '/still-registered', source: 'browser-router' });

			expect(handled).toBe(false);
			expect(fetchSpy).not.toHaveBeenCalled();
			unsubscribe();
		});

		it('stops intercepting document clicks after cleanup-before-handoff releases the runtime', async () => {
			const Page = createMultiLinkPage('ReleasedRuntime', [{ href: '/after-cleanup', label: 'after-cleanup' }]);
			const runtime = getEcoNavigationRuntime(window);
			const fetchSpy = vi
				.spyOn(globalThis, 'fetch')
				.mockResolvedValue(new Response('<html></html>', { status: 200 }));

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: Page,
					pageProps: {},
					options: { viewTransitions: false },
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));
			await runtime.cleanupOwner('react-router');

			const link = container.querySelector(
				'[data-testid="ReleasedRuntime-after-cleanup"]',
			) as HTMLAnchorElement | null;
			expect(link).not.toBeNull();
			link?.addEventListener('click', (event) => event.preventDefault(), { once: true });
			await user.click(link as HTMLAnchorElement);

			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it('intercepts clicks that originate from a text node inside the anchor', async () => {
			const Page = createMultiLinkPage('TextNodeClick', [{ href: '/fast', label: 'fast-link' }]);
			const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
			const createHtml = (label: string) => `
				<html>
					<body>
						<script id="__ECO_PAGE_DATA__" type="application/json">${JSON.stringify({ label })}</script>
						<script type="module">window.__ECO_PAGES__=window.__ECO_PAGES__||{};window.__ECO_PAGES__.page={module:'${moduleUrl}',props:${JSON.stringify({ label })}};import Page from '${moduleUrl}'; hydrateRoot(document, Page);</script>
					</body>
				</html>
			`;

			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(createHtml('fast'), { status: 200 }));

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: Page,
					pageProps: {},
					options: { viewTransitions: false },
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));
			const link = container.querySelector('[data-testid="TextNodeClick-fast-link"]') as HTMLAnchorElement | null;
			const textNode = link?.firstChild;
			expect(link).not.toBeNull();
			expect(textNode).not.toBeNull();

			textNode?.dispatchEvent(
				new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0 }),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(container.textContent).toContain('fast');
			expect(window.__ECO_PAGES__?.page?.props).toEqual({ label: 'fast' });
		});

		it('recovers a rapid click from the last hovered link while a React navigation is in flight', async () => {
			const Page = createMultiLinkPage('HoverRecovery', [
				{ href: '/slow', label: 'slow-link' },
				{ href: '/fast', label: 'fast-link' },
			]);
			const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
			const createHtml = (label: string) => `
				<html>
					<body>
						<script id="__ECO_PAGE_DATA__" type="application/json">${JSON.stringify({ label })}</script>
						<script type="module">window.__ECO_PAGES__=window.__ECO_PAGES__||{};window.__ECO_PAGES__.page={module:'${moduleUrl}',props:${JSON.stringify({ label })}};import Page from '${moduleUrl}'; hydrateRoot(document, Page);</script>
					</body>
				</html>
			`;
			const slowFetch = createDeferred();

			vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
				const url = input.toString();
				if (url === '/slow') {
					return new Promise<Response>((resolve, reject) => {
						const abortSignal = init?.signal;
						const handleAbort = () => {
							reject(new DOMException('Aborted', 'AbortError'));
						};

						abortSignal?.addEventListener('abort', handleAbort, { once: true });
						slowFetch.promise.then(() => {
							abortSignal?.removeEventListener('abort', handleAbort);
							resolve(new Response(createHtml('slow'), { status: 200 }));
						});
					});
				}
				if (url === '/fast') {
					return Promise.resolve(new Response(createHtml('fast'), { status: 200 }));
				}
				throw new Error(`Unexpected fetch: ${url}`);
			});

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: Page,
					pageProps: {},
					options: { viewTransitions: false },
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));
			const slowLink = container.querySelector(
				'[data-testid="HoverRecovery-slow-link"]',
			) as HTMLAnchorElement | null;
			const fastLink = container.querySelector(
				'[data-testid="HoverRecovery-fast-link"]',
			) as HTMLAnchorElement | null;
			expect(slowLink).not.toBeNull();
			expect(fastLink).not.toBeNull();

			await user.click(slowLink as HTMLAnchorElement);
			await user.hover(fastLink as HTMLAnchorElement);
			fastLink?.remove();
			await user.click(container);
			slowFetch.resolve();

			await new Promise((resolve) => setTimeout(resolve, 160));

			expect(container.textContent).toContain('fast');
			expect(window.__ECO_PAGES__?.page?.props).toEqual({ label: 'fast' });
		});

		it('ignores stale navigation results when a newer route finishes first', async () => {
			const Page = createMultiLinkPage('RaceStart', [
				{ href: '/slow', label: 'slow-link' },
				{ href: '/fast', label: 'fast-link' },
			]);
			const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
			const createHtml = (label: string) => `
				<html>
					<body>
						<script id="__ECO_PAGE_DATA__" type="application/json">${JSON.stringify({ label })}</script>
						<script type="module">window.__ECO_PAGES__=window.__ECO_PAGES__||{};window.__ECO_PAGES__.page={module:'${moduleUrl}',props:${JSON.stringify({ label })}};import Page from '${moduleUrl}'; hydrateRoot(document, Page);</script>
					</body>
				</html>
			`;

			vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
				const url = input.toString();
				if (url === '/slow') {
					await new Promise((resolve) => setTimeout(resolve, 60));
					return new Response(createHtml('slow'), { status: 200 });
				}
				if (url === '/fast') {
					return new Response(createHtml('fast'), { status: 200 });
				}
				throw new Error(`Unexpected fetch: ${url}`);
			});

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: Page,
					pageProps: {},
					options: { viewTransitions: false },
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));
			const slowLink = container.querySelector('[data-testid="RaceStart-slow-link"]') as HTMLAnchorElement | null;
			const fastLink = container.querySelector('[data-testid="RaceStart-fast-link"]') as HTMLAnchorElement | null;
			expect(slowLink).not.toBeNull();
			expect(fastLink).not.toBeNull();

			await user.click(slowLink as HTMLAnchorElement);
			await user.click(fastLink as HTMLAnchorElement);

			await new Promise((resolve) => setTimeout(resolve, 160));

			expect(container.textContent).toContain('fast');
			expect(container.textContent).not.toContain('slow');
			expect(window.__ECO_PAGES__?.page?.props).toEqual({ label: 'fast' });
		});

		it('ignores stale browser-router handoff when a newer React route finishes first', async () => {
			const Page = createMultiLinkPage('FallbackRace', [
				{ href: '/outside-react', label: 'outside-link' },
				{ href: '/fast', label: 'fast-link' },
			]);
			const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
			const cleanupSpy = vi.fn();
			const handoffSpy = vi.fn(async () => true);
			window.__ECO_PAGES__ = {
				...window.__ECO_PAGES__,
				react: {
					...window.__ECO_PAGES__?.react,
					cleanupPageRoot: cleanupSpy,
				},
			};
			const unregister = getEcoNavigationRuntime(window).register({
				owner: 'browser-router',
				handoffNavigation: handoffSpy,
			});
			const createHtml = (label: string) => `
				<html>
					<body>
						<script id="__ECO_PAGE_DATA__" type="application/json">${JSON.stringify({ label })}</script>
						<script type="module">window.__ECO_PAGES__=window.__ECO_PAGES__||{};window.__ECO_PAGES__.page={module:'${moduleUrl}',props:${JSON.stringify({ label })}};import Page from '${moduleUrl}'; hydrateRoot(document, Page);</script>
					</body>
				</html>
			`;

			vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
				const url = input.toString();
				if (url === '/outside-react') {
					await new Promise((resolve) => setTimeout(resolve, 60));
					return new Response('<html><body><main>Outside React</main></body></html>', { status: 200 });
				}
				if (url === '/fast') {
					return new Response(createHtml('fast'), { status: 200 });
				}
				throw new Error(`Unexpected fetch: ${url}`);
			});

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: Page,
					pageProps: {},
					options: { viewTransitions: false },
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));
			const outsideLink = container.querySelector(
				'[data-testid="FallbackRace-outside-link"]',
			) as HTMLAnchorElement | null;
			const fastLink = container.querySelector(
				'[data-testid="FallbackRace-fast-link"]',
			) as HTMLAnchorElement | null;
			expect(outsideLink).not.toBeNull();
			expect(fastLink).not.toBeNull();

			await user.click(outsideLink as HTMLAnchorElement);
			await user.click(fastLink as HTMLAnchorElement);

			await new Promise((resolve) => setTimeout(resolve, 160));

			expect(cleanupSpy).not.toHaveBeenCalled();
			expect(handoffSpy).not.toHaveBeenCalled();
			expect(container.textContent).toContain('fast');
			expect(window.__ECO_PAGES__?.page?.props).toEqual({ label: 'fast' });
			unregister();
		});
	});
});
