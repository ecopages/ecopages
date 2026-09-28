import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { morphHead } from '../src/head-morpher';

function createDocument(html: string): Document {
	return new DOMParser().parseFromString(html, 'text/html');
}

describe('morphHead', () => {
	let originalHead: string;

	beforeEach(() => {
		originalHead = document.head.innerHTML;
	});

	afterEach(() => {
		document.head.innerHTML = originalHead;
	});

	it('reuses keyed inline scripts instead of appending duplicates', async () => {
		document.head.innerHTML = [
			'<script id="__ECO_PAGE_DATA__" type="application/json">{"route":"first"}</script>',
			'<script data-eco-script-id="theme-bootstrap" data-eco-rerun="true">window.__theme_runs__=(window.__theme_runs__||0)+1;</script>',
		].join('');
		const nextDocument = createDocument(
			[
				'<html><head>',
				'<script id="__ECO_PAGE_DATA__" type="application/json">{"route":"second"}</script>',
				'<script data-eco-script-id="theme-bootstrap" data-eco-rerun="true">window.__theme_runs__=(window.__theme_runs__||0)+1;</script>',
				'</head><body></body></html>',
			].join(''),
		);

		const { cleanup } = await morphHead(nextDocument);
		cleanup();

		expect(document.head.querySelectorAll('script#__ECO_PAGE_DATA__')).toHaveLength(1);
		expect(document.head.querySelectorAll('script[data-eco-script-id="theme-bootstrap"]')).toHaveLength(1);
		expect(document.head.querySelector<HTMLScriptElement>('script#__ECO_PAGE_DATA__')?.textContent).toBe(
			'{"route":"second"}',
		);
	});

	it('preserves keyed executable inline support scripts when a route omits them', async () => {
		document.head.innerHTML =
			'<script data-eco-script-id="lit-hydrate-support">window.__lit_support_runs__=(window.__lit_support_runs__||0)+1;</script>';
		const nextDocument = createDocument('<html><head><title>Plain route</title></head><body></body></html>');

		const { cleanup } = await morphHead(nextDocument);
		cleanup();

		expect(document.head.querySelectorAll('script[data-eco-script-id="lit-hydrate-support"]')).toHaveLength(1);
	});

	it('replaces keyed rerun scripts when flushed after a route update', async () => {
		document.head.innerHTML =
			'<script data-eco-script-id="theme-bootstrap" data-eco-rerun="true">window.__theme_runs__=1;</script>';
		const originalScript = document.head.querySelector('script[data-eco-script-id="theme-bootstrap"]');
		const nextDocument = createDocument(
			[
				'<html><head>',
				'<script data-eco-script-id="theme-bootstrap" data-eco-rerun="true">window.__theme_runs__=2;</script>',
				'</head><body></body></html>',
			].join(''),
		);

		const { cleanup, flushRerunScripts } = await morphHead(nextDocument);
		flushRerunScripts();
		cleanup();

		const nextScript = document.head.querySelector('script[data-eco-script-id="theme-bootstrap"]');
		expect(nextScript).not.toBe(originalScript);
		expect(nextScript?.textContent).toBe('window.__theme_runs__=2;');
		expect(document.head.querySelectorAll('script[data-eco-script-id="theme-bootstrap"]')).toHaveLength(1);
	});

	it('skips React Router route bootstrap scripts during head morphing', async () => {
		document.head.innerHTML = '<title>Current route</title>';
		const nextDocument = createDocument(
			[
				'<html><head>',
				'<title>Next route</title>',
				'<script src="/assets/ecopages-react-123.js" type="module" data-eco-rerun="true" data-eco-persist="true"></script>',
				'<script src="/assets/scripts/ecopages-react-123-hydration.js" type="module"></script>',
				'<script src="/assets/scripts/ecopages-react-island-123-hydration.js" type="module"></script>',
				'</head><body></body></html>',
			].join(''),
		);

		const { cleanup } = await morphHead(nextDocument);
		cleanup();

		expect(document.title).toBe('Next route');
		expect(document.head.querySelector('script[src="/assets/ecopages-react-123.js"]')).toBeNull();
		expect(document.head.querySelector('script[src="/assets/scripts/ecopages-react-123-hydration.js"]')).toBeNull();
		expect(
			document.head.querySelector('script[src="/assets/scripts/ecopages-react-island-123-hydration.js"]'),
		).not.toBeNull();
	});

	it('skips inline React Router page bootstrap rerun scripts during head morphing', async () => {
		document.head.innerHTML = '<title>Current route</title>';
		const nextDocument = createDocument(
			[
				'<html><head>',
				'<title>Next route</title>',
				'<script type="module" data-eco-rerun="true" data-eco-persist="true" data-eco-script-id="ecopages-react-123">window.__ECO_PAGES__=window.__ECO_PAGES__||{};window.__ECO_PAGES__.page={module:"/@fs/src/pages/react-notes.tsx",props:{}};</script>',
				'</head><body></body></html>',
			].join(''),
		);

		const { cleanup, flushRerunScripts } = await morphHead(nextDocument);
		flushRerunScripts();
		cleanup();

		expect(document.title).toBe('Next route');
		expect(document.head.querySelector('script[data-eco-script-id="ecopages-react-123"]')).toBeNull();
	});

	it('reuses registered rerun callbacks for external module rerun scripts with stable ids', async () => {
		const rerun = vi.fn();
		const runtimeWindow = window as Window &
			typeof globalThis & {
				__ECO_PAGES__?: {
					rerunScripts?: Record<string, () => void>;
				};
			};

		runtimeWindow.__ECO_PAGES__ = {
			rerunScripts: {
				counter: rerun,
			},
		};

		try {
			document.head.innerHTML =
				'<script type="module" src="/assets/counter.js" data-eco-rerun="true" data-eco-script-id="counter"></script>';
			const nextDocument = createDocument(
				[
					'<html><head>',
					'<script type="module" src="/assets/counter.js" data-eco-rerun="true" data-eco-script-id="counter"></script>',
					'</head><body></body></html>',
				].join(''),
			);

			const { cleanup, flushRerunScripts } = await morphHead(nextDocument);
			flushRerunScripts();
			cleanup();

			expect(rerun).toHaveBeenCalledTimes(1);
			expect(
				document.head
					.querySelector<HTMLScriptElement>('script[data-eco-script-id="counter"]')
					?.getAttribute('src'),
			).toBe('/assets/counter.js');
		} finally {
			delete runtimeWindow.__ECO_PAGES__;
		}
	});

	it('falls back to a fresh URL for anonymous external module rerun scripts', async () => {
		document.head.innerHTML = '<script type="module" src="/assets/counter.js" data-eco-rerun="true"></script>';
		const nextDocument = createDocument(
			[
				'<html><head>',
				'<script type="module" src="/assets/counter.js" data-eco-rerun="true"></script>',
				'</head><body></body></html>',
			].join(''),
		);

		const { cleanup, flushRerunScripts } = await morphHead(nextDocument);
		flushRerunScripts();
		cleanup();

		expect(document.head.querySelector<HTMLScriptElement>('script[src*="/assets/counter.js"]')?.src).toContain(
			'__eco_rerun=1',
		);
	});

	it('falls back to a fresh URL when a stable-id external module rerun script has no registered callback', async () => {
		document.head.innerHTML =
			'<script type="module" src="/assets/counter.js" data-eco-rerun="true" data-eco-script-id="counter"></script>';
		const nextDocument = createDocument(
			[
				'<html><head>',
				'<script type="module" src="/assets/counter.js" data-eco-rerun="true" data-eco-script-id="counter"></script>',
				'</head><body></body></html>',
			].join(''),
		);

		const { cleanup, flushRerunScripts } = await morphHead(nextDocument);
		flushRerunScripts();
		cleanup();

		expect(document.head.querySelector<HTMLScriptElement>('script[src*="/assets/counter.js"]')?.src).toContain(
			'__eco_rerun=',
		);
	});
});
