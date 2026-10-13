import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import { createRouter } from '../src/client/eco-router';
import type { EcoRouterOptions } from '../src/client/types';
import {
	clickWithoutNavigation,
	clickWithNavigation,
	createDeferred,
	createLink,
	htmlFetchResponse,
	installEcoRouterTestHooks,
	type EcoRouterTestFixtures,
	spyPushState,
	waitForNavigation,
} from './eco-router.harness';

type LeftAloneRow = {
	name: string;
	attributes: Record<string, string>;
	click?: Partial<MouseEventInit>;
	routerOptions?: EcoRouterOptions;
};

describe('EcoRouter', () => {
	const fixtures: EcoRouterTestFixtures = {
		router: null,
		fetchSpy: null,
	};

	installEcoRouterTestHooks(fixtures);

	describe('Link Interception', () => {
		describe('Internal Links', () => {
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

				await userEvent.click(link);
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
				getEcoNavigationRuntime(window).claimOwnership('react-router');
				const link = createLink({ href: '/pending-react-route', id: 'pending-react-link' });
				const pushStateSpy = spyPushState();

				await Promise.all([waitForNavigation(), userEvent.click(link)]);

				expect(pushStateSpy).toHaveBeenCalled();
			});

			it('should ignore hover when a click lands on a non-link target during a slow navigation', async () => {
				fixtures.router = createRouter();
				const firstFetch = createDeferred();
				fixtures.fetchSpy?.mockImplementation(
					(url: string | URL | Request, init?: RequestInit) =>
						new Promise<Response>((resolve, reject) => {
							if (!String(url).includes('/first-route')) {
								resolve(
									htmlFetchResponse(
										'<html><head></head><body><div id="content">Recovered Content</div></body></html>',
									),
								);
								return;
							}
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

				const firstLink = createLink({ href: '/first-route', id: 'first-link' });
				const hoveredLink = createLink({ href: '/hover-recovered-route', id: 'hovered-link' });
				const pushStateSpy = spyPushState();

				await userEvent.click(firstLink);
				await userEvent.hover(hoveredLink);
				hoveredLink.remove();
				const nonLink = document.createElement('div');
				nonLink.textContent = 'Not a link';
				document.body.appendChild(nonLink);
				const navigation = waitForNavigation();
				await userEvent.click(nonLink);
				firstFetch.resolve();
				await navigation;

				expect(pushStateSpy).toHaveBeenCalledWith({}, '', expect.stringContaining('/first-route'));
				expect(document.body.innerHTML).toContain('First Content');
				expect(document.body.innerHTML).not.toContain('Recovered Content');
			});

			it.each([
				{ name: 'root-relative path', href: '/test-link', expectedUrl: '/test-link' },
				{ name: 'path relative to the origin', href: 'relative/path', expectedUrl: '/relative/path' },
				{
					name: 'same-origin absolute URL',
					href: `${window.location.origin}/absolute-path`,
					expectedUrl: '/absolute-path',
				},
				{
					name: 'link with a query string',
					href: '/page?foo=bar&baz=qux',
					expectedUrl: '/page?foo=bar&baz=qux',
				},
			])('should intercept a click on a $name', async ({ href, expectedUrl }) => {
				fixtures.router = createRouter();
				const pushStateSpy = spyPushState();

				await clickWithNavigation(createLink({ href, id: 'internal-link' }));

				expect(pushStateSpy).toHaveBeenCalledWith({}, '', expect.stringContaining(expectedUrl));
			});

			it.each([
				{
					name: 'a nested element',
					createTarget: (link: HTMLAnchorElement) => {
						const span = document.createElement('span');
						span.textContent = 'Click me';
						link.replaceChildren(span);
						return span;
					},
				},
				{
					name: 'a link inside Shadow DOM',
					createTarget: () => {
						const host = document.createElement('div');
						document.body.appendChild(host);
						const link = document.createElement('a');
						link.href = '/shadow-link';
						link.textContent = 'Shadow Link';
						host.attachShadow({ mode: 'open' }).appendChild(link);
						return link;
					},
				},
			])('should intercept a click on $name', async ({ createTarget }) => {
				fixtures.router = createRouter();
				const link = createLink({ href: '/nested-test', id: 'nested-link' });

				await clickWithNavigation(createTarget(link));
			});
		});

		describe('Links left to the browser', () => {
			const rows: LeftAloneRow[] = [
				{
					name: 'a target other than _self',
					attributes: { href: '/page', target: '_blank' },
				},
				{
					name: 'a modified click',
					attributes: { href: '/page' },
					click: { shiftKey: true },
				},
				{
					name: 'the configured reload attribute',
					attributes: { href: '/reload', 'data-full-reload': '' },
					routerOptions: { reloadAttribute: 'data-full-reload' },
				},
			];

			it.each(rows)('should not intercept $name', async ({ attributes, click, routerOptions }) => {
				fixtures.router = createRouter(routerOptions);

				await clickWithoutNavigation(createLink({ ...attributes, id: 'left-alone' }), click);
			});

			it('should only intercept links matching the link selector', async () => {
				fixtures.router = createRouter({ linkSelector: 'a.router-link' });
				const regularLink = createLink({ href: '/regular', id: 'regular' });
				const routerLink = createLink({ href: '/router', id: 'router', class: 'router-link' });

				await clickWithoutNavigation(regularLink);
				await clickWithNavigation(routerLink);
			});
		});
	});
});
