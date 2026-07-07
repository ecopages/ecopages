import { describe, expect, it, vi } from 'vitest';
import { ECO_DOCUMENT_OWNER_ATTRIBUTE, getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import { createRouter } from '../src/client/eco-router';
import { htmlFetchResponse, installEcoRouterTestHooks, type EcoRouterTestFixtures } from './eco-router.harness';

describe('EcoRouter', () => {
	const fixtures: EcoRouterTestFixtures = {
		router: null,
		fetchSpy: null,
		user: null!,
	};

	installEcoRouterTestHooks(fixtures);

	describe('Lifecycle Events', () => {
		it('should swap directly into a React-owned document when document ownership changes', async () => {
			fixtures.router = createRouter();
			const reactHtml = [
				`<html ${ECO_DOCUMENT_OWNER_ATTRIBUTE}="react-router">`,
				'<head>',
				'</head>',
				'<body><main>React Route</main></body>',
				'</html>',
			].join('');
			fixtures.fetchSpy?.mockResolvedValueOnce(htmlFetchResponse(reactHtml));

			const reloadSpy = vi.spyOn(
				(fixtures.router as unknown as { commitDeps: { reloadDocument: (url: URL) => void } }).commitDeps,
				'reloadDocument',
			);
			reloadSpy.mockImplementation(() => undefined);
			const pushStateSpy = vi.spyOn(window.history, 'pushState');
			const afterSwapSpy = vi.fn();
			document.addEventListener('eco:after-swap', afterSwapSpy);

			try {
				await fixtures.router.navigate('/react-content');

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
			fixtures.router = createRouter();
			const originalDocumentOwner = document.documentElement.getAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE);
			document.documentElement.setAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE, 'react-router');
			const cleanupSpy = vi.fn();
			const unregister = getEcoNavigationRuntime(window).register({
				owner: 'react-router',
				cleanupBeforeHandoff: cleanupSpy,
			});
			getEcoNavigationRuntime(window).claimOwnership('react-router');

			const reloadSpy = vi.spyOn(
				(fixtures.router as unknown as { commitDeps: { reloadDocument: (url: URL) => void } }).commitDeps,
				'reloadDocument',
			);
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
			fixtures.router = createRouter();
			const beforeSwapSpy = vi.fn();
			document.addEventListener('eco:before-swap', beforeSwapSpy);

			try {
				await fixtures.router.navigate('/event-test');
				expect(beforeSwapSpy).toHaveBeenCalledTimes(1);
			} finally {
				document.removeEventListener('eco:before-swap', beforeSwapSpy);
			}
		});

		it('should dispatch eco:after-swap event', async () => {
			fixtures.router = createRouter();
			const afterSwapSpy = vi.fn();
			document.addEventListener('eco:after-swap', afterSwapSpy);

			try {
				await fixtures.router.navigate('/event-test');
				expect(afterSwapSpy).toHaveBeenCalledTimes(1);
			} finally {
				document.removeEventListener('eco:after-swap', afterSwapSpy);
			}
		});

		it('should dispatch eco:page-load event after animation frame', async () => {
			fixtures.router = createRouter();
			const pageLoadSpy = vi.fn();
			const requestAnimationFrameSpy = vi
				.spyOn(window, 'requestAnimationFrame')
				.mockImplementation((callback: FrameRequestCallback): number => {
					callback(performance.now());
					return 1;
				});
			document.addEventListener('eco:page-load', pageLoadSpy);

			try {
				await fixtures.router.navigate('/event-test');
				expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
				expect(pageLoadSpy).toHaveBeenCalledTimes(1);
			} finally {
				document.removeEventListener('eco:page-load', pageLoadSpy);
				requestAnimationFrameSpy.mockRestore();
			}
		});

		it('should provide event details with url and direction', async () => {
			fixtures.router = createRouter();
			let eventDetail: { url: URL; direction: string } | null = null;

			const handler = (e: Event) => {
				eventDetail = (e as CustomEvent).detail;
			};
			document.addEventListener('eco:after-swap', handler);

			try {
				await fixtures.router.navigate('/detail-test');

				expect(eventDetail).not.toBeNull();
				expect(eventDetail!.url).toBeInstanceOf(URL);
				expect(eventDetail!.direction).toBe('forward');
			} finally {
				document.removeEventListener('eco:after-swap', handler);
			}
		});

		it('should provide newDocument in before-swap event', async () => {
			fixtures.router = createRouter();
			let beforeSwapDetail: { newDocument: Document } | null = null;

			const handler = (e: Event) => {
				beforeSwapDetail = (e as CustomEvent).detail;
			};
			document.addEventListener('eco:before-swap', handler);

			try {
				await fixtures.router.navigate('/before-swap-test');

				expect(beforeSwapDetail).not.toBeNull();
				expect(beforeSwapDetail!.newDocument).toBeInstanceOf(Document);
			} finally {
				document.removeEventListener('eco:before-swap', handler);
			}
		});

		it('should provide reload function in before-swap event', async () => {
			fixtures.router = createRouter();
			let reloadFn: Function | null = null;

			const handler = (e: Event) => {
				reloadFn = (e as CustomEvent).detail.reload;
			};
			document.addEventListener('eco:before-swap', handler);

			try {
				await fixtures.router.navigate('/reload-test');
				expect(typeof reloadFn).toBe('function');
			} finally {
				document.removeEventListener('eco:before-swap', handler);
			}
		});
	});
});
