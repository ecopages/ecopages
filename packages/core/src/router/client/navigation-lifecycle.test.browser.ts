import { describe, expect, it, vi } from 'vitest';
import {
	completeNavigationLifecycle,
	dispatchAfterSwap,
	dispatchBeforeSwap,
	ECO_NAVIGATION_LIFECYCLE_EVENTS,
	schedulePageLoad,
} from './navigation-lifecycle.ts';

describe('navigation lifecycle dispatch', () => {
	it('dispatches before-swap with newDocument and reload hook', () => {
		const beforeSwapSpy = vi.fn();
		document.addEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.BEFORE_SWAP, beforeSwapSpy);

		try {
			const newDocument = new DOMParser().parseFromString('<html><body>Next</body></html>', 'text/html');
			const url = new URL('https://example.test/next');
			const { requestedReload } = dispatchBeforeSwap(document, {
				url,
				direction: 'forward',
				newDocument,
			});

			expect(requestedReload).toBe(false);
			expect(beforeSwapSpy).toHaveBeenCalledTimes(1);
			const detail = (beforeSwapSpy.mock.calls[0]![0] as CustomEvent).detail;
			expect(detail.url).toBe(url);
			expect(detail.direction).toBe('forward');
			expect(detail.newDocument).toBe(newDocument);
			expect(typeof detail.reload).toBe('function');
		} finally {
			document.removeEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.BEFORE_SWAP, beforeSwapSpy);
		}
	});

	it('reports reload requests from before-swap listeners', () => {
		const beforeSwapSpy = vi.fn((event: Event) => {
			(event as CustomEvent).detail.reload();
		});
		document.addEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.BEFORE_SWAP, beforeSwapSpy);

		try {
			const { requestedReload } = dispatchBeforeSwap(document, {
				url: new URL('https://example.test/reload'),
				direction: 'forward',
				newDocument: document,
			});

			expect(requestedReload).toBe(true);
		} finally {
			document.removeEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.BEFORE_SWAP, beforeSwapSpy);
		}
	});

	it('dispatches after-swap with url and direction', () => {
		const afterSwapSpy = vi.fn();
		document.addEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.AFTER_SWAP, afterSwapSpy);

		try {
			const url = new URL('https://example.test/after');
			dispatchAfterSwap(document, { url, direction: 'replace' });

			expect(afterSwapSpy).toHaveBeenCalledTimes(1);
			const detail = (afterSwapSpy.mock.calls[0]![0] as CustomEvent).detail;
			expect(detail.url).toBe(url);
			expect(detail.direction).toBe('replace');
		} finally {
			document.removeEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.AFTER_SWAP, afterSwapSpy);
		}
	});

	it('completes navigation lifecycle with after-swap and page-load', () => {
		const afterSwapSpy = vi.fn();
		const pageLoadSpy = vi.fn();
		const scheduleSpy = vi.fn((callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		document.addEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.AFTER_SWAP, afterSwapSpy);
		document.addEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD, pageLoadSpy);

		try {
			const url = new URL('https://example.test/complete');
			completeNavigationLifecycle(document, { url, direction: 'forward' }, { schedule: scheduleSpy });

			expect(afterSwapSpy).toHaveBeenCalledTimes(1);
			expect(pageLoadSpy).toHaveBeenCalledTimes(1);
			expect(scheduleSpy).toHaveBeenCalledTimes(1);
		} finally {
			document.removeEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.AFTER_SWAP, afterSwapSpy);
			document.removeEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD, pageLoadSpy);
		}
	});

	it('schedules page-load on the next animation frame', () => {
		const pageLoadSpy = vi.fn();
		const scheduleSpy = vi.fn((callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		document.addEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD, pageLoadSpy);

		try {
			const url = new URL('https://example.test/page-load');
			schedulePageLoad(document, { url, direction: 'forward' }, { schedule: scheduleSpy });

			expect(scheduleSpy).toHaveBeenCalledTimes(1);
			expect(pageLoadSpy).toHaveBeenCalledTimes(1);
			const detail = (pageLoadSpy.mock.calls[0]![0] as CustomEvent).detail;
			expect(detail.url).toBe(url);
			expect(detail.direction).toBe('forward');
		} finally {
			document.removeEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD, pageLoadSpy);
		}
	});

	it('skips page-load when navigation becomes stale before the frame callback', () => {
		const pageLoadSpy = vi.fn();
		let stale = true;
		document.addEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD, pageLoadSpy);

		try {
			schedulePageLoad(
				document,
				{ url: new URL('https://example.test/stale'), direction: 'forward' },
				{
					isStale: () => stale,
					schedule: (callback) => {
						callback(0);
						return 1;
					},
				},
			);

			expect(pageLoadSpy).not.toHaveBeenCalled();
		} finally {
			document.removeEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD, pageLoadSpy);
		}
	});
});
