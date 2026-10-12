import { describe, expect, it, vi } from 'vitest';
import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import { createRouter } from '../src/client/eco-router';
import {
	createDeferred,
	htmlFetchResponse,
	installEcoRouterTestHooks,
	type EcoRouterTestFixtures,
	waitForNavigation,
} from './eco-router.harness';

describe('EcoRouter', () => {
	const fixtures: EcoRouterTestFixtures = {
		router: null,
		fetchSpy: null,
	};

	installEcoRouterTestHooks(fixtures);

	describe('History Management', () => {
		it('should update history by default', async () => {
			fixtures.router = createRouter();
			const pushStateSpy = vi.spyOn(window.history, 'pushState');

			await fixtures.router.navigate('/history-test');

			expect(pushStateSpy).toHaveBeenCalled();
		});

		it('should not update history when updateHistory is false', async () => {
			fixtures.router = createRouter({ updateHistory: false });
			const pushStateSpy = vi.spyOn(window.history, 'pushState');
			const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

			await fixtures.router.navigate('/no-history-test');

			expect(pushStateSpy).not.toHaveBeenCalled();
			expect(replaceStateSpy).not.toHaveBeenCalled();
		});

		it('should handle popstate events for back/forward navigation', async () => {
			fixtures.router = createRouter();
			const fetchCalled = new Promise((resolve) => {
				fixtures.fetchSpy?.mockImplementationOnce(async () => {
					resolve(true);
					return htmlFetchResponse('<html><body>Popstate Content</body></html>');
				});
			});

			window.history.pushState({}, '', '/popstate-test');
			window.history.pushState({}, '', '/popstate-later');

			window.history.back();
			await fetchCalled;
			await waitForNavigation();

			expect(window.location.pathname).toBe('/popstate-test');
			expect(fixtures.fetchSpy).toHaveBeenCalledWith(
				expect.stringContaining('/popstate-test'),
				expect.anything(),
			);
			expect(document.body.innerHTML).toContain('Popstate Content');
		});
	});

	describe('Error Handling', () => {
		it('should silently handle aborted navigation', async () => {
			fixtures.router = createRouter();
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const abortError = new Error('Aborted');
			abortError.name = 'AbortError';
			fixtures.fetchSpy?.mockRejectedValueOnce(abortError);

			await fixtures.router.navigate('/abort-test');

			expect(consoleSpy).not.toHaveBeenCalled();
			consoleSpy.mockRestore();
		});

		it('should silently ignore stale navigation failures that surface as generic fetch errors', async () => {
			fixtures.router = createRouter();
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			fixtures.fetchSpy?.mockImplementation((url: string | URL | Request, init?: RequestInit) => {
				if (url.toString().includes('/first-page')) {
					return new Promise((_, reject) => {
						init?.signal?.addEventListener('abort', () => reject(new TypeError('Failed to fetch')), {
							once: true,
						});
					});
				}

				return Promise.resolve(htmlFetchResponse('<html><body>Second</body></html>'));
			});

			void fixtures.router.navigate('/first-page');
			await new Promise((resolve) => setTimeout(resolve, 10));
			await fixtures.router.navigate('/second-page');

			expect(consoleSpy).not.toHaveBeenCalled();
			expect(document.body.innerHTML).toContain('Second');
			consoleSpy.mockRestore();
		});
	});

	describe('Navigation Abort', () => {
		it('should abort previous fetch when new navigation starts', async () => {
			fixtures.router = createRouter();

			let abortSignal: AbortSignal | undefined;

			fixtures.fetchSpy?.mockImplementation((url: string | URL | Request, init?: RequestInit) => {
				if (url.toString().includes('/first-page')) {
					abortSignal = init?.signal ?? undefined;
					return new Promise(() => {});
				}
				return Promise.resolve(htmlFetchResponse('<html><body>Second</body></html>'));
			});

			fixtures.router.navigate('/first-page');
			await new Promise((r) => setTimeout(r, 10));

			expect(abortSignal?.aborted).toBe(false);

			await fixtures.router.navigate('/second-page');

			expect(abortSignal?.aborted).toBe(true);
		});

		it('should ignore stale DOM swaps when a newer navigation finishes first', async () => {
			fixtures.router = createRouter({ viewTransitions: false });
			const afterSwapSpy = vi.fn();
			const slowStylesheets: HTMLLinkElement[] = [];
			const originalAppendChild = document.head.appendChild.bind(document.head);
			document.addEventListener('eco:after-swap', afterSwapSpy);
			document.head.appendChild = ((node: Node) => {
				if (node instanceof HTMLLinkElement && node.rel === 'stylesheet') {
					if (node.href.includes('/slow.css')) {
						slowStylesheets.push(node);
						return node;
					}
					const result = originalAppendChild(node);
					queueMicrotask(() => node.dispatchEvent(new Event('load')));
					return result;
				}
				return originalAppendChild(node);
			}) as typeof document.head.appendChild;

			fixtures.fetchSpy?.mockImplementation((url: string | URL | Request) => {
				if (url.toString().includes('/slow-page')) {
					return Promise.resolve(
						htmlFetchResponse(
							'<html><head><link rel="stylesheet" href="/slow.css"></head><body><div id="content">Slow Content</div></body></html>',
						),
					);
				}

				return Promise.resolve(
					htmlFetchResponse('<html><body><div id="content">Fast Content</div></body></html>'),
				);
			});

			try {
				const slowNavigation = fixtures.router.navigate('/slow-page-stylesheet-race');
				await vi.waitFor(() => expect(slowStylesheets).toHaveLength(1));
				await fixtures.router.navigate('/fast-page-stylesheet-race');
				slowStylesheets[0]?.dispatchEvent(new Event('load'));
				await slowNavigation;

				expect(document.body.innerHTML).toContain('Fast Content');
				expect(document.body.innerHTML).not.toContain('Slow Content');
				expect(afterSwapSpy.mock.calls.map(([event]) => (event as CustomEvent).detail.url.href)).toEqual([
					window.location.href,
				]);
			} finally {
				document.head.appendChild = originalAppendChild;
				document.removeEventListener('eco:after-swap', afterSwapSpy);
			}
		});

		it('should abort in-flight browser-router navigation when the coordinator cleans it up for handoff', async () => {
			fixtures.router = createRouter({ viewTransitions: false });
			const slowPage = createDeferred();

			fixtures.fetchSpy?.mockImplementation((url: string | URL | Request, init?: RequestInit) => {
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
							resolve(
								htmlFetchResponse('<html><body><div id="content">Slow Content</div></body></html>'),
							);
						});
					});
				}

				return Promise.resolve(
					htmlFetchResponse('<html><body><div id="content">Fast Content</div></body></html>'),
				);
			});

			const slowNavigation = fixtures.router.navigate('/slow-page');
			await new Promise((resolve) => setTimeout(resolve, 10));
			await getEcoNavigationRuntime(window).cleanupOwner('browser-router');
			slowPage.resolve();
			await slowNavigation;

			expect(document.body.innerHTML).not.toContain('Slow Content');
		});
	});
});
