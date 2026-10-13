import { describe, expect, it, vi } from 'vitest';
import { ECO_DOCUMENT_OWNER_ATTRIBUTE, getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import { createRouter } from '../src/client/eco-router';
import { htmlFetchResponse, installEcoRouterTestHooks, type EcoRouterTestFixtures } from './eco-router.harness';

describe('EcoRouter', () => {
	const fixtures: EcoRouterTestFixtures = {
		router: null,
		fetchSpy: null,
	};

	installEcoRouterTestHooks(fixtures);

	describe('Lifecycle Events', () => {
		it('should swap directly into a React-owned document when document ownership changes', async () => {
			const reloadDocument = vi.fn();
			fixtures.router = createRouter({ reloadDocument });
			const reactHtml = [
				`<html ${ECO_DOCUMENT_OWNER_ATTRIBUTE}="react-router">`,
				'<head>',
				'</head>',
				'<body><main>React Route</main></body>',
				'</html>',
			].join('');
			fixtures.fetchSpy?.mockResolvedValueOnce(htmlFetchResponse(reactHtml));

			const pushStateSpy = vi.spyOn(window.history, 'pushState');
			const afterSwapSpy = vi.fn();
			document.addEventListener('eco:after-swap', afterSwapSpy);

			try {
				await fixtures.router.navigate('/react-content');

				expect(reloadDocument).not.toHaveBeenCalled();
				expect(pushStateSpy).toHaveBeenCalledWith({}, '', expect.stringContaining('/react-content'));
				expect(afterSwapSpy).toHaveBeenCalled();
				expect(document.documentElement.getAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE)).toBe('react-router');
				expect(document.body.innerHTML).toContain('React Route');
				expect(getEcoNavigationRuntime(window).getOwnerState().owner).toBe('react-router');
			} finally {
				document.removeEventListener('eco:after-swap', afterSwapSpy);
				pushStateSpy.mockRestore();
			}
		});

		it('should clean up the active React page root before accepting a delegated handoff to browser-router', async () => {
			const reloadDocument = vi.fn();
			fixtures.router = createRouter({ reloadDocument });
			const originalDocumentOwner = document.documentElement.getAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE);
			document.documentElement.setAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE, 'react-router');
			const cleanupSpy = vi.fn();
			const unregister = getEcoNavigationRuntime(window).register({
				owner: 'react-router',
				cleanupBeforeHandoff: cleanupSpy,
			});
			getEcoNavigationRuntime(window).claimOwnership('react-router');

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
				expect(reloadDocument).not.toHaveBeenCalled();
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

		it('should dispatch before-swap, after-swap and page-load for a navigation', async () => {
			fixtures.router = createRouter();
			const seen: Array<{ type: string; detail: Record<string, unknown>; incomingText: string | null }> = [];
			const names = ['eco:before-swap', 'eco:after-swap', 'eco:page-load'];
			vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback): number => {
				callback(performance.now());
				return 1;
			});
			const record = (event: Event) => {
				const detail = (event as CustomEvent).detail;
				seen.push({
					type: event.type,
					detail,
					incomingText: (detail.newDocument as Document | undefined)?.body.textContent ?? null,
				});
			};
			for (const name of names) document.addEventListener(name, record);

			try {
				await fixtures.router.navigate('/event-test');

				expect(seen.map((entry) => entry.type)).toEqual(names);
				const [beforeSwap, afterSwap] = seen;
				expect(beforeSwap!.incomingText).toContain('New Content');
				expect(typeof beforeSwap!.detail.reload).toBe('function');
				expect((afterSwap!.detail.url as URL).pathname).toBe('/event-test');
				expect(afterSwap!.detail.direction).toBe('forward');
			} finally {
				for (const name of names) document.removeEventListener(name, record);
			}
		});

		it('should run the swap inside startViewTransition when the incoming page has named elements', async () => {
			fixtures.router = createRouter();
			const startViewTransition = vi.spyOn(document, 'startViewTransition');
			fixtures.fetchSpy?.mockImplementation(async () =>
				htmlFetchResponse('<html><head></head><body><h1 data-view-transition="title">Next</h1></body></html>'),
			);

			await fixtures.router.navigate('/with-transition');

			expect(startViewTransition).toHaveBeenCalledTimes(1);
			expect(document.body.textContent).toContain('Next');
		});

		it('should hard-navigate when before-swap requests reload', async () => {
			const reloadDocument = vi.fn();
			fixtures.router = createRouter({ reloadDocument });
			const afterSwapSpy = vi.fn();
			const pageLoadSpy = vi.fn();
			const handler = (e: Event) => {
				(e as CustomEvent).detail.reload();
			};

			document.addEventListener('eco:before-swap', handler);
			document.addEventListener('eco:after-swap', afterSwapSpy);
			document.addEventListener('eco:page-load', pageLoadSpy);

			try {
				await fixtures.router.navigate('/reload-requested');

				expect(reloadDocument).toHaveBeenCalledTimes(1);
				expect(reloadDocument).toHaveBeenCalledWith(expect.stringContaining('/reload-requested'));
				expect(afterSwapSpy).not.toHaveBeenCalled();
				expect(pageLoadSpy).not.toHaveBeenCalled();
			} finally {
				document.removeEventListener('eco:before-swap', handler);
				document.removeEventListener('eco:after-swap', afterSwapSpy);
				document.removeEventListener('eco:page-load', pageLoadSpy);
			}
		});
	});
});
