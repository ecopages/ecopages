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
	it('keeps a stylesheet that becomes persisted before the swap', async () => {
		document.head.replaceChildren();
		const first = '/packages/core/src/router/client/navigation-head.fixture.css';
		const second = '/packages/core/src/router/client/navigation-head-order.fixture.css';
		for (const href of [first, second]) {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = href;
			const loaded = new Promise<void>((resolve) =>
				link.addEventListener('load', () => resolve(), { once: true }),
			);
			document.head.append(link);
			await loaded;
		}
		const original = document.head.querySelector('link')!;
		const reload = vi.fn();
		const swap = vi.fn();
		const result = await commitNavigationPage({
			url: new URL('https://example.test/next'),
			direction: 'forward',
			newDocument: parseDocument(
				`<head><link rel="stylesheet" href="${second}"><link rel="stylesheet" href="${first}"></head>`,
			),
			isStale: () => false,
			viewTransitionsEnabled: false,
			beforeTransition: () => original.setAttribute('data-eco-persist', ''),
			onReloadRequested: reload,
			swap,
		});
		expect(result).toBe('reload-requested');
		expect(reload).toHaveBeenCalledOnce();
		expect(swap).not.toHaveBeenCalled();
		expect(original.isConnected).toBe(true);
	});
	it('requests a full navigation if a staged stylesheet disappears before the swap', async () => {
		const reload = vi.fn();
		const swap = vi.fn();
		const history = vi.fn();
		const result = await commitNavigationPage({
			url: new URL('https://example.test/next'),
			direction: 'forward',
			newDocument: parseDocument(
				'<head><link rel="stylesheet" href="/packages/core/src/router/client/navigation-head.fixture.css"></head>',
			),
			isStale: () => false,
			viewTransitionsEnabled: false,
			beforeTransition: () => document.head.querySelector('link')?.remove(),
			beforeCommit: history,
			onReloadRequested: reload,
			swap,
		});
		expect(result).toBe('reload-requested');
		expect(reload).toHaveBeenCalledOnce();
		expect(history).not.toHaveBeenCalled();
		expect(swap).not.toHaveBeenCalled();
	});
	it('requests a full navigation before swapping when persisted stylesheets would change order', async () => {
		document.head.innerHTML =
			'<link rel="stylesheet" href="/a.css" data-eco-persist><link rel="stylesheet" href="/b.css">';
		const original = document.head.querySelector('link');
		const reload = vi.fn();
		const swap = vi.fn();
		const result = await commitNavigationPage({
			url: new URL('https://example.test/next'),
			direction: 'forward',
			newDocument: parseDocument(
				'<head><link rel="stylesheet" href="/b.css"><link rel="stylesheet" href="/a.css" data-eco-persist></head>',
			),
			isStale: () => false,
			viewTransitionsEnabled: false,
			onReloadRequested: reload,
			swap,
		});
		expect(result).toBe('reload-requested');
		expect(reload).toHaveBeenCalledOnce();
		expect(swap).not.toHaveBeenCalled();
		expect(document.head.querySelector('link')).toBe(original);
	});
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

	it('runs the body scripts that wait on a head script after the navigation completes', async () => {
		document.head.innerHTML = '<title>Current</title>';
		document.body.innerHTML = '<main>Current page</main>';
		let completed = false;
		const win = window as unknown as Record<string, unknown>;

		try {
			await commitNavigationPage({
				url: new URL('https://example.test/next'),
				direction: 'forward',
				newDocument: parseDocument(
					'<html><head><title>Next</title><script src="data:text/javascript,window.__head_first__=1"></script></head><body><main>Next page</main><script>window.__body_saw_head__=window.__head_first__</script></body></html>',
				),
				isStale: () => completed,
				viewTransitionsEnabled: false,
				swap: () => {
					document.body.innerHTML =
						'<main>Next page</main><script>window.__body_saw_head__=window.__head_first__</script>';
				},
			});
			completed = true;

			await vi.waitFor(() => expect(win.__body_saw_head__).toBe(1));
		} finally {
			delete win.__head_first__;
			delete win.__body_saw_head__;
		}
	});

	it('does not prepare or swap a page after a before-swap listener requests reload', async () => {
		document.title = 'Current';
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
			expect(document.title).toBe('Current');
		} finally {
			document.removeEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.BEFORE_SWAP, handleBeforeSwap);
		}
	});
});
