import { afterEach, describe, expect, it, vi } from 'vitest';
import { activatePreparedNavigationScripts, prepareNavigationHead } from './navigation-pipeline.ts';

function parseDocument(html: string): Document {
	return new DOMParser().parseFromString(html, 'text/html');
}

afterEach(() => {
	document.head.replaceChildren();
	vi.restoreAllMocks();
});

describe('shared navigation head updates', () => {
	it('updates metadata, waits for incoming stylesheets, removes stale stylesheets, and preserves stable elements', async () => {
		document.head.innerHTML = [
			'<meta charset="utf-8">',
			'<meta name="description" content="Old description">',
			'<meta name="theme-color" content="persisted" data-eco-persist>',
			'<link rel="stylesheet" href="/old.css">',
		].join('');
		const incoming = parseDocument(
			'<html><head><title>Next</title><meta name="description" content="New description"><meta name="keywords" content="navigation"><link rel="stylesheet" href="/new.css"></head><body></body></html>',
		);
		const originalAppendChild = document.head.appendChild.bind(document.head);
		const stagedStylesheets: HTMLLinkElement[] = [];
		document.head.appendChild = ((node: Node) => {
			const result = originalAppendChild(node);
			if (node instanceof HTMLLinkElement && node.href.endsWith('/new.css')) {
				stagedStylesheets.push(node);
				queueMicrotask(() => node.dispatchEvent(new Event('load')));
			}
			return result;
		}) as typeof document.head.appendChild;

		const update = await prepareNavigationHead(incoming);
		document.head.appendChild = originalAppendChild;
		expect(stagedStylesheets).toHaveLength(1);
		update.commit();

		expect(document.title).toBe('Next');
		expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
			'New description',
		);
		expect(document.head.querySelector('meta[name="keywords"]')?.getAttribute('content')).toBe('navigation');
		expect(document.head.querySelector('meta[charset]')).not.toBeNull();
		expect(document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('persisted');
		expect(document.head.querySelector('link[href$="old.css"]')).toBeNull();
		expect(document.head.querySelectorAll('link[href$="new.css"]')).toHaveLength(1);
		expect(document.head.querySelector('link[href$="new.css"]')).not.toBeNull();
	});

	it('cancels preloaded stylesheets when a navigation becomes stale', async () => {
		document.head.innerHTML = '<link rel="stylesheet" href="/current.css">';
		const incoming = parseDocument(
			'<html><head><link rel="stylesheet" href="/stale.css"></head><body></body></html>',
		);
		const originalAppendChild = document.head.appendChild.bind(document.head);
		const stagedStylesheets: HTMLLinkElement[] = [];
		document.head.appendChild = ((node: Node) => {
			const result = originalAppendChild(node);
			if (node instanceof HTMLLinkElement && node.href.endsWith('/stale.css')) {
				stagedStylesheets.push(node);
				queueMicrotask(() => node.dispatchEvent(new Event('load')));
			}
			return result;
		}) as typeof document.head.appendChild;

		const update = await prepareNavigationHead(incoming);
		document.head.appendChild = originalAppendChild;
		update.cancel();

		expect(stagedStylesheets[0]?.isConnected).toBe(false);
		expect(document.head.querySelector('link[href$="current.css"]')).not.toBeNull();
		expect(document.head.querySelector('link[href$="stale.css"]')).toBeNull();
	});

	it('settles a stylesheet wait when a newer navigation removes its staged link', async () => {
		const staleNavigation = parseDocument(
			'<html><head><link rel="stylesheet" href="https://example.invalid/stale-navigation.css"></head><body></body></html>',
		);
		const currentNavigation = parseDocument('<html><head></head><body></body></html>');
		const staleUpdatePromise = prepareNavigationHead(staleNavigation);
		const stagedStylesheet = document.head.querySelector<HTMLLinkElement>('link[href$="stale-navigation.css"]');
		expect(stagedStylesheet).not.toBeNull();

		let staleUpdateReady = false;
		const staleUpdateSettled = staleUpdatePromise.then((update) => {
			staleUpdateReady = true;
			update.cancel();
		});
		const currentUpdate = await prepareNavigationHead(currentNavigation);
		currentUpdate.commit();

		try {
			await vi.waitFor(() => expect(staleUpdateReady).toBe(true), { interval: 1 });
			expect(stagedStylesheet?.isConnected).toBe(false);
		} finally {
			stagedStylesheet?.dispatchEvent(new Event('error'));
			await staleUpdateSettled;
		}
	});

	it('keeps a shared staged stylesheet until every overlapping navigation is settled', async () => {
		const incoming = parseDocument(
			'<html><head><link rel="stylesheet" href="/shared.css"></head><body></body></html>',
		);
		const firstUpdatePromise = prepareNavigationHead(incoming);
		await vi.waitFor(() =>
			expect(document.head.querySelector<HTMLLinkElement>('link[href$="shared.css"]')).not.toBeNull(),
		);

		const secondUpdatePromise = prepareNavigationHead(incoming);
		let secondUpdateReady = false;
		void secondUpdatePromise.then(() => {
			secondUpdateReady = true;
		});
		await Promise.resolve();
		expect(secondUpdateReady).toBe(false);

		document.head.querySelector<HTMLLinkElement>('link[href$="shared.css"]')?.dispatchEvent(new Event('load'));
		const [firstUpdate, secondUpdate] = await Promise.all([firstUpdatePromise, secondUpdatePromise]);
		firstUpdate.cancel();
		secondUpdate.commit();

		expect(document.head.querySelectorAll('link[href$="shared.css"]')).toHaveLength(1);
		expect(document.head.querySelector('link[href$="shared.css"]')?.isConnected).toBe(true);
	});

	it('shares script identity, skips router-specific bootstrap scripts, and activates fresh head scripts once', async () => {
		document.head.innerHTML = '<script id="page-data" type="application/json">{"route":"old"}</script>';
		const incoming = parseDocument(
			'<html><head><script id="page-data" type="application/json">{"route":"new"}</script><script id="route-module" type="module" src="/route.js"></script><script src="/assets/ecopages-react-123.js" type="module"></script><script type="module" data-eco-rerun data-eco-script-id="ecopages-react-456">window.__ECO_PAGES__={page:{}}</script></head><body></body></html>',
		);
		const update = await prepareNavigationHead(incoming, undefined, (script) => {
			const scriptId = script.getAttribute('data-eco-script-id');
			const src = script.getAttribute('src');
			return Boolean(scriptId?.startsWith('ecopages-react-') || src?.includes('ecopages-react-'));
		});
		update.commit();
		activatePreparedNavigationScripts(update, undefined, false);

		expect(document.head.querySelector<HTMLScriptElement>('#page-data')?.textContent).toBe('{"route":"new"}');
		expect(document.head.querySelectorAll('script#route-module')).toHaveLength(1);
		expect(document.head.querySelector('script[src*="ecopages-react-"]')).toBeNull();
		expect(update.rerunScriptActivations).toHaveLength(0);
	});
});
