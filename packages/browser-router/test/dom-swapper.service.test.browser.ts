import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	activatePreparedNavigationScripts,
	prepareNavigationHead,
	type NavigationHeadUpdate,
} from '@ecopages/core/router/navigation-pipeline';
import { stageStylesheets } from '../../core/src/router/client/staged-stylesheets.test-fixtures.ts';
import { DomSwapper } from '../src/client/dom/dom-swapper.ts';

function parseDocument(html: string): Document {
	return new DOMParser().parseFromString(html, 'text/html');
}

async function prepareHead(newDocument: Document): Promise<NavigationHeadUpdate> {
	const update = await prepareNavigationHead(newDocument);
	update.commit();
	return update;
}

function flushScripts(update: NavigationHeadUpdate): void {
	activatePreparedNavigationScripts(update, 'data-eco-persist');
}

/**
 * Resolves after the browser has run every task queued before the call.
 *
 * @remarks
 * For asserting that something did not happen. A message-channel round trip runs after all pending
 * promise reactions without a timer, so it cannot be mistaken for waiting out a delay.
 */
function flushTasks(): Promise<void> {
	return new Promise((resolve) => {
		const channel = new MessageChannel();
		channel.port1.onmessage = () => resolve();
		channel.port2.postMessage(null);
	});
}

function resetDocument(): void {
	document.head.innerHTML = '';
	document.body.innerHTML = '';
	document.title = '';
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('DomSwapper service behavior', () => {
	it('parses HTML with a temporary base tag when a navigation URL is provided', () => {
		resetDocument();
		const swapper = new DomSwapper('data-eco-persist');
		const newDocument = swapper.parseHTML(
			'<html><head></head><body><a href="./child">Child</a></body></html>',
			new URL('https://example.com/docs/page'),
		);

		expect(newDocument.querySelector('base[data-eco-injected]')?.getAttribute('href')).toBe(
			'https://example.com/docs/page',
		);
		expect((newDocument.querySelector('a') as HTMLAnchorElement | null)?.href).toBe(
			'https://example.com/docs/child',
		);
	});

	it('preloads only missing stylesheets from the incoming document', async () => {
		resetDocument();
		const existingHref = new URL('/assets/existing.css', window.location.origin).href;
		const nextHref = new URL('/assets/next.css', window.location.origin).href;
		document.head.innerHTML = `<link rel="stylesheet" href="${existingHref}">`;
		const newDocument = parseDocument(
			[
				'<html><head>',
				`<link rel="stylesheet" href="${existingHref}">`,
				`<link rel="stylesheet" href="${nextHref}">`,
				'</head><body></body></html>',
			].join(''),
		);

		const staged = stageStylesheets();

		try {
			await prepareNavigationHead(newDocument);
		} finally {
			staged.stop();
		}

		expect(staged.links.map((link) => link.href)).toEqual([nextHref]);
		expect(document.head.querySelectorAll(`link[href="${nextHref}"]`)).toHaveLength(1);
	});

	it('deduplicates keyed head scripts while removing stale non-persistent scripts', async () => {
		resetDocument();
		const swapper = new DomSwapper('data-eco-persist');
		document.head.innerHTML = [
			'<script src="/old-script.js"></script>',
			'<script type="module" src="/persisted.js" data-eco-persist="true"></script>',
			'<script data-eco-script-id="stable-script">window.__stable_script_runs__=(window.__stable_script_runs__||0)+1;</script>',
		].join('');
		(window as typeof window & { __stable_script_runs__?: number }).__stable_script_runs__ = 1;

		const newDocument = parseDocument(
			[
				'<html><head>',
				'<script data-eco-script-id="stable-script">window.__stable_script_runs__=(window.__stable_script_runs__||0)+1;</script>',
				'<script src="/next-script.js"></script>',
				'</head><body><div>Next Content</div></body></html>',
			].join(''),
		);
		const headUpdate = await prepareHead(newDocument);
		swapper.morphBody(newDocument);
		flushScripts(headUpdate);

		expect(document.head.querySelector('script[src$="/old-script.js"]')).toBeNull();
		expect(document.head.querySelector('script[src$="/next-script.js"]')).not.toBeNull();
		expect(document.head.querySelector('script[src$="/persisted.js"][data-eco-persist="true"]')).not.toBeNull();
		expect(document.head.querySelectorAll('script[data-eco-script-id="stable-script"]')).toHaveLength(1);
		expect((window as typeof window & { __stable_script_runs__?: number }).__stable_script_runs__).toBe(1);
	});

	it('runs the head scripts a swap adds and every body script, in document order, after earlier libraries load', async () => {
		resetDocument();
		const swapper = new DomSwapper('data-eco-persist');
		const runs: string[] = [];
		(window as typeof window & { __body_script_runs__?: string[] }).__body_script_runs__ = runs;
		const record = (label: string) => `window.__body_script_runs__.push('${label}')`;
		document.body.innerHTML = `<script>${record('kept')}</script>`;

		const newDocument = parseDocument(
			[
				`<html><head><script src="data:text/javascript,${encodeURIComponent(record('library'))}"></script>`,
				`<script>${record('head-inline')}</script></head><body>`,
				`<script>${record('kept')}</script>`,
				'<main>Next</main>',
				`<script>${record('inline')}</script>`,
				'<script type="application/json">{"data":true}</script>',
				'</body></html>',
			].join(''),
		);
		const headUpdate = await prepareHead(newDocument);
		swapper.morphBody(newDocument);
		const dataScript = document.body.querySelector('script[type="application/json"]');
		flushScripts(headUpdate);

		await vi.waitFor(() => expect(runs).toEqual(['library', 'head-inline', 'kept', 'inline']));
		expect(document.body.querySelector('script[type="application/json"]')).toBe(dataScript);
	});

	it('keeps a script inside a persisted element without running it again during a body morph', async () => {
		resetDocument();
		const swapper = new DomSwapper('data-eco-persist');
		const runs: string[] = [];
		(window as typeof window & { __body_script_runs__?: string[] }).__body_script_runs__ = runs;
		const record = (label: string) => `window.__body_script_runs__.push('${label}')`;
		const persisted = `<div data-eco-persist="widget"><script>${record('persisted')}</script></div>`;
		document.body.innerHTML = persisted;
		const liveScript = document.body.querySelector('script');

		const newDocument = parseDocument(
			`<html><head></head><body>${persisted}<script>${record('footer')}</script></body></html>`,
		);

		const headUpdate = await prepareHead(newDocument);
		swapper.morphBody(newDocument);
		flushScripts(headUpdate);

		await vi.waitFor(() => expect(runs).toEqual(['footer']));
		expect(document.body.querySelector('[data-eco-persist] script')).toBe(liveScript);
	});

	it('makes body scripts wait for a library the head of the same swap is still loading', async () => {
		resetDocument();
		const swapper = new DomSwapper('data-eco-persist');
		const runs: string[] = [];
		(window as typeof window & { __body_script_runs__?: string[] }).__body_script_runs__ = runs;
		const record = (label: string) => `window.__body_script_runs__.push('${label}')`;

		const newDocument = parseDocument(
			[
				`<html><head><script src="data:text/javascript,${encodeURIComponent(record('library'))}"></script></head>`,
				`<body><script>${record('inline')}</script></body></html>`,
			].join(''),
		);
		const headUpdate = await prepareHead(newDocument);
		swapper.morphBody(newDocument);
		flushScripts(headUpdate);

		await vi.waitFor(() => expect(runs).toEqual(['library', 'inline']));
	});

	it('runs rerun scripts after the head scripts of the same swap, and body scripts after both', async () => {
		resetDocument();
		const swapper = new DomSwapper('data-eco-persist');
		const runs: string[] = [];
		(window as typeof window & { __body_script_runs__?: string[] }).__body_script_runs__ = runs;
		const record = (label: string) => `window.__body_script_runs__.push('${label}')`;

		const newDocument = parseDocument(
			[
				`<html><head><script src="data:text/javascript,${encodeURIComponent(record('library'))}"></script>`,
				`<script data-eco-rerun="true">${record('rerun')}</script></head>`,
				`<body><script>${record('body')}</script></body></html>`,
			].join(''),
		);

		const headUpdate = await prepareHead(newDocument);
		swapper.morphBody(newDocument);
		flushScripts(headUpdate);

		await vi.waitFor(() => expect(runs).toEqual(['library', 'rerun', 'body']));
	});

	it('refreshes non-persisted nodes before rerun scripts attach their event handlers', async () => {
		resetDocument();
		const swapper = new DomSwapper('data-eco-persist');
		const persistedMarkup = '<aside data-eco-persist="sidebar">Sidebar</aside>';
		const shellMarkup = `<section id="sidebar-shell">${persistedMarkup}</section>`;
		document.body.innerHTML = `${shellMarkup}<button id="save">Save</button>`;
		const liveShell = document.querySelector('section');
		const liveSidebar = document.querySelector('aside');
		const previousSaveButton = document.querySelector<HTMLButtonElement>('#save')!;
		const incrementSaveCount = (button: HTMLButtonElement) => {
			const count = Number(button.getAttribute('data-save-count') ?? '0');
			button.setAttribute('data-save-count', String(count + 1));
		};
		previousSaveButton.addEventListener('click', () => incrementSaveCount(previousSaveButton));

		const newDocument = parseDocument(
			[
				'<html><head>',
				'<script data-eco-rerun="true">document.querySelector("#save")?.addEventListener("click", event => { const button = event.currentTarget; button.setAttribute("data-save-count", String(Number(button.getAttribute("data-save-count") ?? "0") + 1)); });</script>',
				'</head><body>',
				shellMarkup,
				'<button id="save">Save</button>',
				'</body></html>',
			].join(''),
		);

		const headUpdate = await prepareHead(newDocument);
		swapper.morphBody(newDocument);
		flushScripts(headUpdate);

		const nextSaveButton = document.querySelector<HTMLButtonElement>('#save')!;
		nextSaveButton.click();
		expect(nextSaveButton).toHaveAttribute('data-save-count', '1');
		expect(nextSaveButton).not.toBe(previousSaveButton);
		expect(document.querySelector('section')).toBe(liveShell);
		expect(document.querySelector('aside')).toBe(liveSidebar);
	});

	it('runs body scripts before returning when no earlier script is still loading', async () => {
		resetDocument();
		const swapper = new DomSwapper('data-eco-persist');
		const runs: string[] = [];
		(window as typeof window & { __body_script_runs__?: string[] }).__body_script_runs__ = runs;

		const newDocument = parseDocument(
			"<html><head></head><body><script>window.__body_script_runs__.push('body')</script></body></html>",
		);

		const headUpdate = await prepareHead(newDocument);
		swapper.morphBody(newDocument);
		flushScripts(headUpdate);

		expect(runs).toEqual(['body']);
	});

	it("stops a page's script sequence when the next swap flushes its own", async () => {
		resetDocument();
		const swapper = new DomSwapper('data-eco-persist');
		const runs: string[] = [];
		(window as typeof window & { __body_script_runs__?: string[] }).__body_script_runs__ = runs;
		const record = (label: string) => `window.__body_script_runs__.push('${label}')`;

		const first = parseDocument(
			[
				`<html><head><script src="data:text/javascript,${encodeURIComponent(record('library'))}"></script>`,
				`<script>${record('first')}</script></head><body></body></html>`,
			].join(''),
		);
		const firstHeadUpdate = await prepareHead(first);
		swapper.morphBody(first);
		flushScripts(firstHeadUpdate);

		const second = parseDocument(`<html><head></head><body><script>${record('second')}</script></body></html>`);
		const secondHeadUpdate = await prepareHead(second);
		swapper.morphBody(second);
		flushScripts(secondHeadUpdate);

		await vi.waitFor(() => expect(runs).toContain('library'), { interval: 1 });
		await flushTasks();
		expect(runs).toEqual(['second', 'library']);
	});

	it('does not wait on nomodule or non-JavaScript scripts, which the browser never loads', async () => {
		resetDocument();
		const swapper = new DomSwapper('data-eco-persist');
		const runs: string[] = [];
		(window as typeof window & { __body_script_runs__?: string[] }).__body_script_runs__ = runs;
		const record = (label: string) => `window.__body_script_runs__.push('${label}')`;

		const newDocument = parseDocument(
			[
				'<html><head></head><body>',
				`<script nomodule src="data:text/javascript,${encodeURIComponent(record('legacy'))}"></script>`,
				`<script type="text/plain" src="data:text/javascript,${encodeURIComponent(record('consent'))}"></script>`,
				`<script>${record('inline')}</script>`,
				'</body></html>',
			].join(''),
		);

		const headUpdate = await prepareHead(newDocument);
		swapper.morphBody(newDocument);
		flushScripts(headUpdate);

		await vi.waitFor(() => expect(runs).toEqual(['inline']));
	});

	it('replaces page data before rerun hydration scripts execute', async () => {
		resetDocument();
		const swapper = new DomSwapper('data-eco-persist');
		document.head.innerHTML =
			'<script id="__ECO_PAGE_DATA__" type="application/json">{"routeFiles":["old-route"]}</script>';

		const newDocument = parseDocument(
			[
				'<html><head>',
				'<script id="__ECO_PAGE_DATA__" type="application/json">{"routeFiles":["react-server-files/index.tsx","react-server-files/tree.server.ts"]}</script>',
				'<script data-eco-rerun="true" data-eco-script-id="page-data-check">',
				'document.body.setAttribute("data-route-files",JSON.parse(document.getElementById("__ECO_PAGE_DATA__")?.textContent ?? "{}").routeFiles?.join(",") ?? "missing")',
				'</script>',
				'</head><body><div id="content">New Content</div></body></html>',
			].join(''),
		);

		const headUpdate = await prepareHead(newDocument);
		swapper.morphBody(newDocument);
		flushScripts(headUpdate);

		expect(document.body.getAttribute('data-route-files')).toBe(
			'react-server-files/index.tsx,react-server-files/tree.server.ts',
		);
		expect(document.head.querySelectorAll('script#__ECO_PAGE_DATA__')).toHaveLength(1);
	});

	it('reuses registered rerun callbacks for external module scripts with stable ids', async () => {
		resetDocument();
		const swapper = new DomSwapper('data-eco-persist');
		const rerun = vi.fn();
		const observedSrcs: string[] = [];
		const originalAppendChild = document.head.appendChild.bind(document.head);
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

		document.head.appendChild = ((node: Node) => {
			if (node instanceof HTMLScriptElement && (node.getAttribute('src') ?? '').includes('/assets/counter.js')) {
				observedSrcs.push(node.getAttribute('src') ?? '');
			}
			return originalAppendChild(node);
		}) as typeof document.head.appendChild;

		try {
			const nextHtml = parseDocument(
				[
					'<html><head>',
					'<script type="module" src="/assets/counter.js" data-eco-rerun="true" data-eco-script-id="counter"></script>',
					'</head><body><div id="content">Counter Page</div></body></html>',
				].join(''),
			);

			const headUpdate1 = await prepareHead(nextHtml);
			swapper.morphBody(nextHtml);
			flushScripts(headUpdate1);

			const headUpdate2 = await prepareHead(nextHtml);
			swapper.morphBody(nextHtml);
			flushScripts(headUpdate2);
		} finally {
			document.head.appendChild = originalAppendChild;
			delete runtimeWindow.__ECO_PAGES__;
		}

		expect(rerun).toHaveBeenCalledTimes(2);
		expect(observedSrcs).toEqual(['/assets/counter.js']);
		expect(document.head.querySelectorAll('script[src*="/assets/counter.js"]')).toHaveLength(1);
	});
});
