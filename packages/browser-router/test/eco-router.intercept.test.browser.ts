import { describe, expect, it, vi } from 'vitest';
import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import { createRouter } from '../src/client/eco-router';
import {
	clickWithoutNavigation,
	clickWithNavigation,
	createDeferred,
	createLink,
	htmlFetchResponse,
	installEcoRouterTestHooks,
	preventDefaultOnClick,
	type EcoRouterTestFixtures,
	simulateClick,
	spyPushState,
	waitForNavigation,
} from './eco-router.harness';

describe('EcoRouter', () => {
	const fixtures: EcoRouterTestFixtures = {
		router: null,
		fetchSpy: null,
		user: null!,
	};

	installEcoRouterTestHooks(fixtures);

	describe('Link Interception', () => {
		describe('Internal Links', () => {
			it('should not intercept clicks while another runtime owns navigation', () => {
				getEcoNavigationRuntime(window).claimOwnership('custom-router');
				fixtures.router = createRouter();
				const link = createLink({ href: '/react-route', id: 'react-link' });
				clickWithoutNavigation(link);
			});

			it('should delegate clicks to the active runtime instead of dropping them', async () => {
				const navigateSpy = vi.fn(async () => true);
				fixtures.router = createRouter();
				const unregister = getEcoNavigationRuntime(window).register({
					owner: 'react-router',
					navigate: navigateSpy,
				});
				getEcoNavigationRuntime(window).claimOwnership('react-router');
				const link = createLink({ href: '/react-route', id: 'delegated-react-link' });
				const pushStateSpy = spyPushState();

				await fixtures.user.click(link);
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
				fixtures.router = createRouter();
				getEcoNavigationRuntime(window).setOwner('react-router');
				const link = createLink({ href: '/pending-react-route', id: 'pending-react-link' });
				const pushStateSpy = spyPushState();

				await Promise.all([waitForNavigation(), fixtures.user.click(link)]);

				expect(pushStateSpy).toHaveBeenCalled();
			});

			it('should ignore hover when a click lands on a non-link target during a slow navigation', async () => {
				fixtures.router = createRouter();
				const firstFetch = createDeferred();
				fixtures.fetchSpy?.mockImplementationOnce(
					(url: string | URL | Request, init?: RequestInit) =>
						new Promise<Response>((resolve, reject) => {
							const abortSignal = init?.signal;
							const handleAbort = () => {
								reject(new DOMException('Aborted', 'AbortError'));
							};

							abortSignal?.addEventListener('abort', handleAbort, { once: true });
							firstFetch.promise.then(() => {
								abortSignal?.removeEventListener('abort', handleAbort);
								resolve(
									htmlFetchResponse(
										'<html><head></head><body><div id="content">First Content</div></body></html>',
									),
								);
							});
						}),
				);
				fixtures.fetchSpy?.mockResolvedValueOnce(
					htmlFetchResponse(
						'<html><head></head><body><div id="content">Recovered Content</div></body></html>',
					),
				);

				const firstLink = createLink({ href: '/first-route', id: 'first-link' });
				const hoveredLink = createLink({ href: '/hover-recovered-route', id: 'hovered-link' });
				const pushStateSpy = spyPushState();

				await fixtures.user.click(firstLink);
				await fixtures.user.hover(hoveredLink);
				hoveredLink.remove();
				const navigation = waitForNavigation();
				await fixtures.user.click(document.body);
				firstFetch.resolve();
				await navigation;

				expect(pushStateSpy).toHaveBeenCalledWith({}, '', expect.stringContaining('/first-route'));
				expect(document.body.innerHTML).toContain('First Content');
				expect(document.body.innerHTML).not.toContain('Recovered Content');
			});

			it('should intercept clicks on internal links', async () => {
				fixtures.router = createRouter();
				const link = createLink({ href: '/test-link', id: 'link' });
				const pushStateSpy = spyPushState();

				await Promise.all([waitForNavigation(), fixtures.user.click(link)]);

				expect(pushStateSpy).toHaveBeenCalled();
			});

			it('should intercept clicks on relative path links', async () => {
				fixtures.router = createRouter();
				const link = createLink({ href: 'relative/path', id: 'rel-link' });
				await clickWithNavigation(link);
			});

			it('should intercept clicks on links with query parameters', async () => {
				fixtures.router = createRouter();
				const link = createLink({ href: '/page?foo=bar&baz=qux', id: 'query-link' });
				const pushStateSpy = spyPushState();

				simulateClick(link);
				await waitForNavigation();

				expect(pushStateSpy).toHaveBeenCalledWith({}, '', expect.stringContaining('/page?foo=bar&baz=qux'));
			});

			it('should intercept clicks on same-origin absolute URLs', async () => {
				fixtures.router = createRouter();
				const link = createLink({ href: `${window.location.origin}/absolute-path`, id: 'abs-link' });
				await clickWithNavigation(link);
			});

			it('should intercept clicks on nested anchor elements', async () => {
				fixtures.router = createRouter();
				const link = createLink({ href: '/nested-test', id: 'nested-link' });
				const span = document.createElement('span');
				span.textContent = 'Click me';
				link.innerHTML = '';
				link.appendChild(span);

				await clickWithNavigation(span);
			});

			it('should intercept clicks on links inside Shadow DOM', async () => {
				fixtures.router = createRouter();
				const host = document.createElement('div');
				host.id = 'shadow-host';
				document.body.appendChild(host);
				const shadow = host.attachShadow({ mode: 'open' });
				const link = document.createElement('a');
				link.href = '/shadow-link';
				link.textContent = 'Shadow Link';
				shadow.appendChild(link);

				await clickWithNavigation(link);
			});
		});

		describe('External Links (should NOT intercept)', () => {
			it('should NOT intercept external links', () => {
				fixtures.router = createRouter();
				clickWithoutNavigation(createLink({ href: 'https://example.com', id: 'ext-link' }));
			});

			it('should NOT intercept cross-origin links with different port', () => {
				fixtures.router = createRouter();
				clickWithoutNavigation(createLink({ href: 'http://localhost:9999/different-port', id: 'port-link' }));
			});
		});

		describe('Link Attributes (should NOT intercept)', () => {
			it('should NOT intercept links with target="_blank"', () => {
				fixtures.router = createRouter();
				clickWithoutNavigation(createLink({ href: '/page', target: '_blank', id: 'blank-link' }));
			});

			it('should NOT intercept links with target="_parent"', () => {
				fixtures.router = createRouter();
				clickWithoutNavigation(createLink({ href: '/page', target: '_parent', id: 'parent-link' }));
			});

			it('should NOT intercept links with target="_top"', () => {
				fixtures.router = createRouter();
				clickWithoutNavigation(createLink({ href: '/page', target: '_top', id: 'top-link' }));
			});

			it('should intercept links with target="_self"', async () => {
				fixtures.router = createRouter();
				await clickWithNavigation(createLink({ href: '/page', target: '_self', id: 'self-link' }));
			});

			it('should NOT intercept links with download attribute', () => {
				fixtures.router = createRouter();
				clickWithoutNavigation(createLink({ href: '/file.pdf', download: '', id: 'dl-link' }));
			});

			it('should NOT intercept links with download attribute and filename', () => {
				fixtures.router = createRouter();
				clickWithoutNavigation(
					createLink({ href: '/file.pdf', download: 'custom-name.pdf', id: 'dl-named-link' }),
				);
			});

			it('should NOT intercept links to static asset files', () => {
				fixtures.router = createRouter();
				const pushStateSpy = spyPushState();

				for (const href of ['/skill.txt', '/skill/reference/full-stack.md', '/llms.txt']) {
					const link = createLink({ href, id: `static-${href}` });
					preventDefaultOnClick(link);
					simulateClick(link);
				}

				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should NOT intercept links with data-eco-reload attribute', () => {
				fixtures.router = createRouter();
				clickWithoutNavigation(createLink({ href: '/reload', 'data-eco-reload': '', id: 'reload-link' }));
			});

			it('should NOT intercept links without href attribute', () => {
				fixtures.router = createRouter();
				const link = document.createElement('a');
				link.id = 'no-href-link';
				link.textContent = 'No href';
				document.body.appendChild(link);
				clickWithoutNavigation(link);
			});
		});

		describe('Special href Values (should NOT intercept)', () => {
			it('should NOT intercept hash-only links', () => {
				fixtures.router = createRouter();
				clickWithoutNavigation(createLink({ href: '#section', id: 'hash-link' }));
			});

			it('should NOT intercept javascript: links', () => {
				fixtures.router = createRouter();
				const link = createLink({ href: 'javascript:void(0)', id: 'js-link' });
				const pushStateSpy = spyPushState();
				simulateClick(link);
				expect(pushStateSpy).not.toHaveBeenCalled();
			});

			it('should NOT intercept mailto: links', () => {
				fixtures.router = createRouter();
				clickWithoutNavigation(createLink({ href: 'mailto:test@example.com', id: 'mailto-link' }));
			});

			it('should NOT intercept tel: links', () => {
				fixtures.router = createRouter();
				clickWithoutNavigation(createLink({ href: 'tel:+1234567890', id: 'tel-link' }));
			});
		});

		describe('Modifier Keys (should NOT intercept)', () => {
			it('should NOT intercept clicks with metaKey (Cmd on Mac)', () => {
				fixtures.router = createRouter();
				clickWithoutNavigation(createLink({ href: '/page', id: 'meta-link' }), { metaKey: true });
			});

			it('should NOT intercept clicks with ctrlKey', () => {
				fixtures.router = createRouter();
				clickWithoutNavigation(createLink({ href: '/page', id: 'ctrl-link' }), { ctrlKey: true });
			});

			it('should NOT intercept clicks with shiftKey', () => {
				fixtures.router = createRouter();
				clickWithoutNavigation(createLink({ href: '/page', id: 'shift-link' }), { shiftKey: true });
			});

			it('should NOT intercept clicks with altKey', () => {
				fixtures.router = createRouter();
				clickWithoutNavigation(createLink({ href: '/page', id: 'alt-link' }), { altKey: true });
			});

			it('should NOT intercept middle mouse button clicks', () => {
				fixtures.router = createRouter();
				clickWithoutNavigation(createLink({ href: '/page', id: 'middle-link' }), { button: 1 });
			});

			it('should NOT intercept right mouse button clicks', () => {
				fixtures.router = createRouter();
				clickWithoutNavigation(createLink({ href: '/page', id: 'right-link' }), { button: 2 });
			});
		});

		describe('Custom Link Selector', () => {
			it('should only intercept links matching custom selector', async () => {
				fixtures.router = createRouter({ linkSelector: 'a.router-link' });
				const regularLink = createLink({ href: '/regular', id: 'regular' });
				const routerLink = createLink({ href: '/router', id: 'router', class: 'router-link' });
				const pushStateSpy = spyPushState();
				preventDefaultOnClick(regularLink);

				simulateClick(regularLink);
				expect(pushStateSpy).not.toHaveBeenCalled();

				simulateClick(routerLink);
				await waitForNavigation();
				expect(pushStateSpy).toHaveBeenCalled();
			});

			it('should work with data attribute selector', async () => {
				fixtures.router = createRouter({ linkSelector: 'a[data-router]' });
				await clickWithNavigation(createLink({ href: '/data-router', 'data-router': '', id: 'data-link' }));
			});
		});

		describe('Custom Reload Attribute', () => {
			it('should respect custom reload attribute', () => {
				fixtures.router = createRouter({ reloadAttribute: 'data-full-reload' });
				clickWithoutNavigation(createLink({ href: '/reload', 'data-full-reload': '', id: 'custom-reload' }));
			});

			it('should intercept links with default reload attribute when custom is set', async () => {
				fixtures.router = createRouter({ reloadAttribute: 'data-full-reload' });
				await clickWithNavigation(createLink({ href: '/reload', 'data-eco-reload': '', id: 'default-reload' }));
			});
		});
	});
});
