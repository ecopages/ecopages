import { describe, expect, it, vi } from 'vitest';
import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import { createRouter, EcoRouter } from '../src/client/eco-router';
import { htmlFetchResponse, installEcoRouterTestHooks, type EcoRouterTestFixtures } from './eco-router.harness';

describe('EcoRouter', () => {
	const fixtures: EcoRouterTestFixtures = {
		router: null,
		fetchSpy: null,
		user: null!,
	};

	installEcoRouterTestHooks(fixtures);

	describe('Initialization', () => {
		it('should create router instance', () => {
			fixtures.router = createRouter();
			expect(fixtures.router).toBeInstanceOf(EcoRouter);
		});

		it('should reuse the active router instance across repeated createRouter calls', () => {
			const firstRouter = createRouter();
			const secondRouter = createRouter();

			fixtures.router = firstRouter;
			expect(secondRouter).toBe(firstRouter);
		});

		it('should register and clean up browser-router navigation through the coordinator', () => {
			fixtures.router = new EcoRouter();
			fixtures.router.start();

			expect(getEcoNavigationRuntime(window).getOwnerState()).toEqual({
				owner: 'browser-router',
				canHandleSpaNavigation: true,
			});

			fixtures.router.stop();

			expect(getEcoNavigationRuntime(window).getOwnerState()).toEqual({
				owner: 'none',
				canHandleSpaNavigation: false,
			});
		});

		it('should start and stop without errors', () => {
			fixtures.router = new EcoRouter();
			expect(() => fixtures.router!.start()).not.toThrow();
			expect(() => fixtures.router!.stop()).not.toThrow();
		});
	});

	describe('Programmatic Navigation', () => {
		it('should navigate and update history with pushState', async () => {
			fixtures.router = createRouter();
			const pushStateSpy = vi.spyOn(window.history, 'pushState');

			await fixtures.router.navigate('/new-page');

			expect(pushStateSpy).toHaveBeenCalledWith({}, '', expect.stringContaining('/new-page'));
			expect(document.body.innerHTML).toContain('New Content');
		});

		it('should use replaceState when replace option is true', async () => {
			fixtures.router = createRouter();
			const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

			await fixtures.router.navigate('/replaced-page', { replace: true });

			expect(replaceStateSpy).toHaveBeenCalledWith({}, '', expect.stringContaining('/replaced-page'));
		});
	});

	describe('DOM Updates', () => {
		it('should update both head and body content', async () => {
			fixtures.router = createRouter();
			const fullMockHtml =
				'<html><head><title>New Title</title></head><body><div id="content">New Content</div></body></html>';
			fixtures.fetchSpy?.mockResolvedValueOnce(htmlFetchResponse(fullMockHtml));

			await fixtures.router.navigate('/full-update');

			expect(document.title).toBe('New Title');
			expect(document.body.innerHTML).toContain('New Content');
		});

		it('should allow custom html attributes to sync when configured', async () => {
			document.documentElement.setAttribute('data-theme', 'dark');
			fixtures.router = createRouter({
				documentElementAttributesToSync: ['lang', 'data-theme'],
			});
			const fullMockHtml =
				'<html lang="fr" data-theme="light"><head><title>New Title</title></head><body><div id="content">New Content</div></body></html>';
			fixtures.fetchSpy?.mockResolvedValueOnce(htmlFetchResponse(fullMockHtml));

			await fixtures.router.navigate('/custom-html-sync');

			expect(document.documentElement.getAttribute('data-theme')).toBe('light');
			expect(document.documentElement.getAttribute('lang')).toBe('fr');
		});
	});
});
