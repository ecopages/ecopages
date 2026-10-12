import { afterEach, describe, expect, it, vi } from 'vitest';
import { ECO_NAVIGATION_LIFECYCLE_EVENTS } from './navigation-lifecycle.ts';
import { commitNavigationPage } from './navigation-pipeline.ts';

function parseDocument(html: string): Document {
	return new DOMParser().parseFromString(html, 'text/html');
}

afterEach(() => {
	document.head.replaceChildren();
	document.body.replaceChildren();
});

describe('commitNavigationPage', () => {
	it('runs shared document work around the router-provided swap', async () => {
		document.head.innerHTML = '<title>Current</title>';
		document.body.innerHTML = '<main>Current page</main>';
		const beforeSwap = vi.fn();
		const afterSwap = vi.fn();
		const pageLoad = vi.fn();
		const order: string[] = [];
		document.addEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.BEFORE_SWAP, beforeSwap);
		document.addEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.AFTER_SWAP, afterSwap);
		document.addEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD, pageLoad);

		try {
			const result = await commitNavigationPage({
				url: new URL('https://example.test/next'),
				direction: 'forward',
				newDocument: parseDocument(
					'<html><head><title>Next</title><script id="next-script">window.__next_script_runs__=1</script></head><body><main>Next page</main></body></html>',
				),
				isStale: () => false,
				viewTransitionsEnabled: false,
				beforeTransition: () => {
					order.push('prepare');
				},
				beforeCommit: () => {
					order.push('history');
				},
				swap: () => {
					order.push('swap');
					document.body.innerHTML = '<main>Next page</main>';
				},
				onSwapped: () => {
					order.push('owner');
				},
				afterSwap: () => {
					order.push('scroll');
					expect(document.head.querySelector('#next-script')).not.toBeNull();
				},
				afterLifecycle: () => {
					order.push('after-lifecycle');
				},
			});

			expect(result).toBe('committed');
			expect(order).toEqual(['prepare', 'history', 'swap', 'owner', 'scroll', 'after-lifecycle']);
			expect(document.title).toBe('Next');
			expect(document.body.textContent).toContain('Next page');
			expect(beforeSwap).toHaveBeenCalledOnce();
			expect(afterSwap).toHaveBeenCalledOnce();
			await vi.waitFor(() => expect(pageLoad).toHaveBeenCalledOnce());
		} finally {
			document.removeEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.BEFORE_SWAP, beforeSwap);
			document.removeEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.AFTER_SWAP, afterSwap);
			document.removeEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD, pageLoad);
		}
	});

	it('does not prepare or swap a page after a before-swap listener requests reload', async () => {
		const reloadRequested = vi.fn();
		const swap = vi.fn();
		const handleBeforeSwap = (event: Event) => {
			(event as CustomEvent).detail.reload();
		};
		document.addEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.BEFORE_SWAP, handleBeforeSwap);

		try {
			const result = await commitNavigationPage({
				url: new URL('https://example.test/reload'),
				direction: 'forward',
				newDocument: parseDocument('<html><head><title>Next</title></head><body></body></html>'),
				isStale: () => false,
				viewTransitionsEnabled: false,
				onReloadRequested: reloadRequested,
				swap,
			});

			expect(result).toBe('reload-requested');
			expect(reloadRequested).toHaveBeenCalledOnce();
			expect(swap).not.toHaveBeenCalled();
			expect(document.title).toBe('');
		} finally {
			document.removeEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.BEFORE_SWAP, handleBeforeSwap);
		}
	});
});
