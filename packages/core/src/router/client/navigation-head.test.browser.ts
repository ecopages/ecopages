import { afterEach, describe, expect, it, vi } from 'vitest';
import { activatePreparedNavigationScripts, prepareNavigationHead } from './navigation-pipeline.ts';
import { stageStylesheets } from './staged-stylesheets.test-fixtures.ts';

function parseDocument(html: string): Document {
	return new DOMParser().parseFromString(html, 'text/html');
}

afterEach(() => {
	document.head.replaceChildren();
	vi.restoreAllMocks();
});

describe('shared navigation head updates', () => {
	it('keeps a persisted duplicate stylesheet during a reorder', async () => {
		const first = '/packages/core/src/router/client/navigation-head.fixture.css';
		const second = '/packages/core/src/router/client/navigation-head-order.fixture.css';
		document.head.innerHTML = `<link rel="stylesheet" href="${first}" data-eco-persist><link rel="stylesheet" href="${first}"><link rel="stylesheet" href="${second}">`;
		const persisted = document.head.querySelector('[data-eco-persist]')!;
		const update = await prepareNavigationHead(
			parseDocument(
				`<head><link rel="stylesheet" href="${second}"><link rel="stylesheet" href="${first}"></head>`,
			),
		);
		expect(update.requiresReload).toBe(true);
		expect(persisted.isConnected).toBe(true);
		update.cancel();
	});
	it('requests a full navigation if an earlier commit changes the retained stylesheet order', async () => {
		const urls = ['a', 'b', 'c'].map(
			(value) => `/packages/core/src/router/client/navigation-head.fixture.css?${value}`,
		);
		for (const href of urls.slice(0, 2)) {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = href;
			const loaded = new Promise<void>((resolve) =>
				link.addEventListener('load', () => resolve(), { once: true }),
			);
			document.head.append(link);
			await loaded;
		}
		const page = (order: number[]) =>
			parseDocument(
				`<head>${order.map((index) => `<link rel="stylesheet" href="${urls[index]}">`).join('')}</head>`,
			);
		const older = await prepareNavigationHead(page([1, 0, 2]));
		const newer = await prepareNavigationHead(page([0, 1, 2]));
		older.commit();
		expect(newer.requiresReload).toBe(true);
		newer.cancel();
	});
	it('requests a full navigation if a retained stylesheet disappears before commit', async () => {
		const href = '/packages/core/src/router/client/navigation-head.fixture.css';
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = href;
		const loaded = new Promise<void>((resolve) => link.addEventListener('load', () => resolve(), { once: true }));
		document.head.append(link);
		await loaded;
		const older = await prepareNavigationHead(parseDocument('<head></head>'));
		const newer = await prepareNavigationHead(parseDocument(`<head><link rel="stylesheet" href="${href}"></head>`));
		older.commit();
		expect(newer.requiresReload).toBe(true);
		newer.cancel();
	});
	it('keeps a newer navigation’s staged stylesheet when an older update commits', async () => {
		const first = '/packages/core/src/router/client/navigation-head.fixture.css';
		const second = '/packages/core/src/router/client/navigation-head-order.fixture.css';
		const older = await prepareNavigationHead(
			parseDocument(`<head><link rel="stylesheet" href="${first}"></head>`),
		);
		const newer = await prepareNavigationHead(
			parseDocument(`<head><link rel="stylesheet" href="${second}"></head>`),
		);
		older.commit();
		expect(newer.requiresReload).toBe(false);
		newer.commit();
		expect(getComputedStyle(document.documentElement).backgroundColor).toBe('rgb(120, 34, 56)');
	});
	it('requests a full navigation when a persisted stylesheet would need to move', async () => {
		document.head.innerHTML =
			'<link rel="stylesheet" href="/a.css" data-eco-persist><link rel="stylesheet" href="/b.css">';
		const retained = document.head.querySelector('link');
		const incoming = parseDocument(
			'<head><link rel="stylesheet" href="/b.css"><link rel="stylesheet" href="/a.css" data-eco-persist></head>',
		);
		const update = await prepareNavigationHead(incoming);
		expect(update.requiresReload).toBe(true);
		expect(document.head.querySelector('link')).toBe(retained);
		update.cancel();
	});

	it('requests a full navigation when a replacement stylesheet fails', async () => {
		document.head.innerHTML = '<link rel="stylesheet" href="/a.css"><link rel="stylesheet" href="/b.css">';
		const originals = [...document.head.querySelectorAll('link')];
		const originalAppend = document.head.appendChild.bind(document.head);
		vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
			const result = originalAppend(node);
			if (node instanceof HTMLLinkElement) queueMicrotask(() => node.dispatchEvent(new Event('error')));
			return result;
		});
		const incoming = parseDocument(
			'<head><link rel="stylesheet" href="/b.css"><link rel="stylesheet" href="/a.css"></head>',
		);
		const update = await prepareNavigationHead(incoming);
		expect(update.requiresReload).toBe(true);
		expect(originals.every((link) => link.isConnected)).toBe(true);
		update.cancel();
	});

	it('requests a full navigation when a replacement stylesheet times out', async () => {
		document.head.innerHTML = '<link rel="stylesheet" href="/a.css"><link rel="stylesheet" href="/b.css">';
		const originals = [...document.head.querySelectorAll('link')];
		vi.useFakeTimers();
		try {
			vi.spyOn(document.head, 'appendChild').mockImplementation((node) => node);
			vi.spyOn(document.head, 'insertBefore').mockImplementation((node) => node);
			const incoming = parseDocument(
				'<head><link rel="stylesheet" href="/b.css"><link rel="stylesheet" href="/a.css"></head>',
			);
			const pending = prepareNavigationHead(incoming);
			await vi.advanceTimersByTimeAsync(5000);
			const update = await pending;
			expect(update.requiresReload).toBe(true);
			expect(originals.every((link) => link.isConnected)).toBe(true);
			update.cancel();
		} finally {
			vi.useRealTimers();
		}
	});
	it('uses the destination order across overlapping three-stylesheet navigations', async () => {
		const urls = ['a', 'b', 'c'].map(
			(value) => `/packages/core/src/router/client/navigation-head.fixture.css?${value}`,
		);
		const permutations = [
			[0, 1, 2],
			[0, 2, 1],
			[1, 0, 2],
			[1, 2, 0],
			[2, 0, 1],
			[2, 1, 0],
		];
		for (const first of permutations) {
			for (const latest of permutations) {
				document.head.replaceChildren();
				const link = document.createElement('link');
				link.rel = 'stylesheet';
				link.href = urls[0]!;
				const loaded = new Promise<void>((resolve) =>
					link.addEventListener('load', () => resolve(), { once: true }),
				);
				document.head.append(link);
				await loaded;
				const page = (order: number[]) =>
					parseDocument(
						`<head>${order.map((index) => `<link rel="stylesheet" href="${urls[index]}">`).join('')}</head>`,
					);
				const firstUpdate = await prepareNavigationHead(page(first));
				const latestUpdate = await prepareNavigationHead(page(latest));
				firstUpdate.cancel();
				latestUpdate.commit();
				expect(
					Array.from(
						document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
						(item) => item.href,
					),
				).toEqual(latest.map((index) => new URL(urls[index]!, window.location.origin).href));
			}
		}
	});

	it('removes active stylesheets when a later navigation supersedes a staged reorder', async () => {
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
		const pending = await prepareNavigationHead(
			parseDocument(
				`<head><link rel="stylesheet" href="${second}"><link rel="stylesheet" href="${first}"></head>`,
			),
		);
		const latest = await prepareNavigationHead(parseDocument('<head></head>'));
		latest.commit();
		pending.cancel();
		expect(document.head.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(0);
	});

	it('keeps a shared stylesheet applied when navigating between layouts', async () => {
		const href = '/packages/core/src/router/client/navigation-head.fixture.css';
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.setAttribute('href', href);
		const loaded = new Promise<void>((resolve) => link.addEventListener('load', () => resolve(), { once: true }));
		document.head.append(link);
		await loaded;
		const incoming = parseDocument(`<html><head><link rel="stylesheet" href="${href}"></head><body></body></html>`);
		const update = await prepareNavigationHead(incoming);

		update.commit();

		expect(getComputedStyle(document.documentElement).backgroundColor).toBe('rgb(12, 34, 56)');
	});

	it('does not apply an incoming stylesheet before the head update commits', async () => {
		document.head.innerHTML = '<style>html { background-color: rgb(1, 2, 3) }</style>';
		const incoming = parseDocument(
			'<html><head><link rel="stylesheet" href="/packages/core/src/router/client/navigation-head.fixture.css"></head><body></body></html>',
		);
		const update = await prepareNavigationHead(incoming);

		try {
			expect(getComputedStyle(document.documentElement).backgroundColor).toBe('rgb(1, 2, 3)');
			update.commit();
			expect(getComputedStyle(document.documentElement).backgroundColor).toBe('rgb(12, 34, 56)');
		} finally {
			update.cancel();
		}
	});

	it('inserts incoming styles before retained styles in destination order', async () => {
		document.head.innerHTML = '<style id="shared">html { color: rgb(1, 2, 3) }</style>';
		const incoming = parseDocument(
			'<html><head><style id="new">html { color: rgb(4, 5, 6) }</style><style id="shared">html { color: rgb(1, 2, 3) }</style></head><body></body></html>',
		);
		const update = await prepareNavigationHead(incoming);

		update.commit();

		expect(getComputedStyle(document.documentElement).color).toBe('rgb(1, 2, 3)');
	});

	it('uses destination order when retained styles reverse', async () => {
		document.head.innerHTML =
			'<style id="a">html { color: rgb(1, 2, 3) }</style><style id="b">html { color: rgb(4, 5, 6) }</style>';
		const incoming = parseDocument(
			'<head><style id="b">html { color: rgb(4, 5, 6) }</style><style id="a">html { color: rgb(1, 2, 3) }</style></head>',
		);
		const update = await prepareNavigationHead(incoming);
		update.commit();
		expect(getComputedStyle(document.documentElement).color).toBe('rgb(1, 2, 3)');
	});

	it('uses destination order when retained stylesheets reverse', async () => {
		const firstHref = '/packages/core/src/router/client/navigation-head.fixture.css';
		const secondHref = '/packages/core/src/router/client/navigation-head-order.fixture.css';
		for (const href of [firstHref, secondHref]) {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = href;
			const loaded = new Promise<void>((resolve) =>
				link.addEventListener('load', () => resolve(), { once: true }),
			);
			document.head.append(link);
			await loaded;
		}
		const incoming = parseDocument(
			`<head><link rel="stylesheet" href="${secondHref}"><link rel="stylesheet" href="${firstHref}"></head>`,
		);
		const update = await prepareNavigationHead(incoming);
		update.commit();
		expect(getComputedStyle(document.documentElement).backgroundColor).toBe('rgb(12, 34, 56)');
	});

	it('keeps the latest retained stylesheet order when an earlier reorder is cancelled', async () => {
		const firstHref = '/packages/core/src/router/client/navigation-head.fixture.css';
		const secondHref = '/packages/core/src/router/client/navigation-head-order.fixture.css';
		for (const href of [firstHref, secondHref]) {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = href;
			const loaded = new Promise<void>((resolve) =>
				link.addEventListener('load', () => resolve(), { once: true }),
			);
			document.head.append(link);
			await loaded;
		}
		const first = parseDocument(
			`<head><link rel="stylesheet" href="${secondHref}"><link rel="stylesheet" href="${firstHref}"></head>`,
		);
		const latest = parseDocument(
			`<head><link rel="stylesheet" href="${firstHref}"><link rel="stylesheet" href="${secondHref}"></head>`,
		);
		const firstUpdate = await prepareNavigationHead(first);
		const latestUpdate = await prepareNavigationHead(latest);
		firstUpdate.cancel();
		latestUpdate.commit();
		expect(getComputedStyle(document.documentElement).backgroundColor).toBe('rgb(120, 34, 56)');
	});

	it('orders retained styles against a retained stylesheet', async () => {
		const href = '/packages/core/src/router/client/navigation-head.fixture.css';
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = href;
		const loaded = new Promise<void>((resolve) => link.addEventListener('load', () => resolve(), { once: true }));
		document.head.append(link);
		await loaded;
		const style = document.createElement('style');
		style.id = 'shared';
		style.textContent = 'html { background-color: rgb(1, 2, 3) }';
		document.head.append(style);
		const incoming = parseDocument(
			`<head><style id="shared">html { background-color: rgb(1, 2, 3) }</style><link rel="stylesheet" href="${href}"></head>`,
		);
		const update = await prepareNavigationHead(incoming);
		update.commit();
		expect(getComputedStyle(document.documentElement).backgroundColor).toBe('rgb(12, 34, 56)');
	});

	it('orders a new stylesheet before a retained stylesheet without replacing it', async () => {
		const sharedHref = '/packages/core/src/router/client/navigation-head.fixture.css';
		const incomingHref = '/packages/core/src/router/client/navigation-head-order.fixture.css';
		const sharedLink = document.createElement('link');
		sharedLink.rel = 'stylesheet';
		sharedLink.href = sharedHref;
		const loaded = new Promise<void>((resolve) =>
			sharedLink.addEventListener('load', () => resolve(), { once: true }),
		);
		document.head.append(sharedLink);
		await loaded;
		const incoming = parseDocument(
			`<html><head><link rel="stylesheet" href="${incomingHref}"><link rel="stylesheet" href="${sharedHref}"></head><body></body></html>`,
		);
		const update = await prepareNavigationHead(incoming);

		update.commit();

		expect(document.head.querySelector<HTMLLinkElement>(`link[href="${sharedHref}"]`)).toBe(sharedLink);
		expect(Array.from(document.head.querySelectorAll('link'), (link) => link.href)).toEqual([
			new URL(incomingHref, window.location.origin).href,
			new URL(sharedHref, window.location.origin).href,
		]);
		expect(getComputedStyle(document.documentElement).backgroundColor).toBe('rgb(12, 34, 56)');
	});

	it('uses the latest destination order for a reused staged stylesheet', async () => {
		const sharedHref = '/packages/core/src/router/client/navigation-head.fixture.css';
		const incomingHref = '/packages/core/src/router/client/navigation-head-order.fixture.css';
		const sharedLink = document.createElement('link');
		sharedLink.rel = 'stylesheet';
		sharedLink.href = sharedHref;
		const loaded = new Promise<void>((resolve) =>
			sharedLink.addEventListener('load', () => resolve(), { once: true }),
		);
		document.head.append(sharedLink);
		await loaded;
		const firstIncoming = parseDocument(
			`<html><head><link rel="stylesheet" href="${incomingHref}"><link rel="stylesheet" href="${sharedHref}"></head><body></body></html>`,
		);
		const latestIncoming = parseDocument(
			`<html><head><link rel="stylesheet" href="${sharedHref}"><link rel="stylesheet" href="${incomingHref}"></head><body></body></html>`,
		);
		const firstUpdate = await prepareNavigationHead(firstIncoming);
		const latestUpdate = await prepareNavigationHead(latestIncoming);
		firstUpdate.cancel();

		latestUpdate.commit();

		expect(document.head.querySelector<HTMLLinkElement>(`link[href="${sharedHref}"]`)).toBe(sharedLink);
		expect(Array.from(document.head.querySelectorAll('link'), (link) => link.href)).toEqual([
			new URL(sharedHref, window.location.origin).href,
			new URL(incomingHref, window.location.origin).href,
		]);
		expect(getComputedStyle(document.documentElement).backgroundColor).toBe('rgb(120, 34, 56)');
	});

	it('commits each overlapping head update with its own stylesheet order', async () => {
		const sharedHref = '/packages/core/src/router/client/navigation-head.fixture.css';
		const incomingHref = '/packages/core/src/router/client/navigation-head-order.fixture.css';
		const sharedLink = document.createElement('link');
		sharedLink.rel = 'stylesheet';
		sharedLink.href = sharedHref;
		const loaded = new Promise<void>((resolve) =>
			sharedLink.addEventListener('load', () => resolve(), { once: true }),
		);
		document.head.append(sharedLink);
		await loaded;
		const first = parseDocument(
			`<head><link rel="stylesheet" href="${incomingHref}"><link rel="stylesheet" href="${sharedHref}"></head>`,
		);
		const second = parseDocument(
			`<head><link rel="stylesheet" href="${sharedHref}"><link rel="stylesheet" href="${incomingHref}"></head>`,
		);
		const firstUpdate = await prepareNavigationHead(first);
		const secondUpdate = await prepareNavigationHead(second);

		firstUpdate.commit();
		expect(getComputedStyle(document.documentElement).backgroundColor).toBe('rgb(12, 34, 56)');
		secondUpdate.commit();
		expect(getComputedStyle(document.documentElement).backgroundColor).toBe('rgb(120, 34, 56)');
	});

	it('updates base and canonical URLs when the destination changes them', async () => {
		document.head.innerHTML =
			'<base href="https://example.com/old/"><link rel="canonical" href="https://example.com/old">';
		const incoming = parseDocument(
			'<html><head><base href="https://example.com/new/"><link rel="canonical" href="https://example.com/new"></head></html>',
		);
		const update = await prepareNavigationHead(incoming);

		update.commit();

		expect(document.head.querySelector('base')?.href).toBe('https://example.com/new/');
		expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(
			'https://example.com/new',
		);
	});

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
		const staged = stageStylesheets();

		const update = await prepareNavigationHead(incoming);
		staged.stop();
		expect(staged.links.map((link) => link.href)).toEqual([new URL('/new.css', window.location.origin).href]);
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
		const staged = stageStylesheets();

		const update = await prepareNavigationHead(incoming);
		staged.stop();
		update.cancel();

		expect(staged.links).toHaveLength(1);
		expect(staged.links[0]?.isConnected).toBe(false);
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
