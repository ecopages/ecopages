import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetRerunNonceForTests } from '@ecopages/core/client/navigation-scripts';
import { DomSwapper } from '../src/client/dom/dom-swapper.ts';
import { ViewTransitionManager } from '../src/client/services/view-transition-manager.ts';

type DocumentWithViewTransition = Document & {
	startViewTransition?: (callback: () => void | Promise<void>) => {
		finished: Promise<void>;
		ready: Promise<void>;
		updateCallbackDone: Promise<void>;
		skipTransition(): void;
	};
};

function parseDocument(html: string): Document {
	return new DOMParser().parseFromString(html, 'text/html');
}

function resetDocument(): void {
	document.head.innerHTML = '';
	document.body.innerHTML = '';
	document.title = '';
	resetRerunNonceForTests();
}

afterEach(() => {
	Reflect.deleteProperty(document as DocumentWithViewTransition, 'startViewTransition');
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
		const swapper = new DomSwapper('data-eco-persist');
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

		const appendedHrefs: string[] = [];
		const originalAppendChild = document.head.appendChild.bind(document.head);

		document.head.appendChild = ((node: Node) => {
			const result = originalAppendChild(node);
			if (node instanceof HTMLLinkElement && node.rel === 'stylesheet') {
				appendedHrefs.push(node.href);
				queueMicrotask(() => {
					node.onload?.(new Event('load'));
				});
			}
			return result;
		}) as typeof document.head.appendChild;

		try {
			await swapper.preloadStylesheets(newDocument);
		} finally {
			document.head.appendChild = originalAppendChild;
		}

		expect(appendedHrefs).toEqual([nextHref]);
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

		swapper.morphHead(newDocument);
		swapper.replaceBody(newDocument);
		swapper.flushScripts();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(document.head.querySelector('script[src="/old-script.js"]')).toBeNull();
		expect(document.head.querySelector('script[src="/next-script.js"]')).not.toBeNull();
		expect(document.head.querySelector('script[src="/persisted.js"][data-eco-persist="true"]')).not.toBeNull();
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

		swapper.morphHead(newDocument);
		swapper.morphBody(newDocument);
		const dataScript = document.body.querySelector('script[type="application/json"]');
		swapper.flushScripts();

		await vi.waitFor(() => expect(runs).toEqual(['library', 'head-inline', 'kept', 'inline']));
		expect(document.body.querySelector('script[type="application/json"]')).toBe(dataScript);
	});

	it.each(['morphBody', 'replaceBody'] as const)(
		'keeps a script inside a persisted element without running it again (%s)',
		async (swap) => {
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

			swapper.morphHead(newDocument);
			swapper[swap](newDocument);
			swapper.flushScripts();

			await vi.waitFor(() => expect(runs).toEqual(['footer']));
			expect(document.body.querySelector('[data-eco-persist] script')).toBe(liveScript);
		},
	);

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

		swapper.morphHead(newDocument);
		swapper.morphBody(newDocument);
		swapper.flushScripts();

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

		swapper.morphHead(newDocument);
		swapper.replaceBody(newDocument);
		swapper.flushScripts();

		await vi.waitFor(() => expect(runs).toEqual(['library', 'rerun', 'body']));
	});

	it('runs body scripts before returning when no earlier script is still loading', () => {
		resetDocument();
		const swapper = new DomSwapper('data-eco-persist');
		const runs: string[] = [];
		(window as typeof window & { __body_script_runs__?: string[] }).__body_script_runs__ = runs;

		const newDocument = parseDocument(
			"<html><head></head><body><script>window.__body_script_runs__.push('body')</script></body></html>",
		);

		swapper.morphHead(newDocument);
		swapper.morphBody(newDocument);
		swapper.flushScripts();

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
		swapper.morphHead(first);
		swapper.replaceBody(first);
		swapper.flushScripts();

		const second = parseDocument(`<html><head></head><body><script>${record('second')}</script></body></html>`);
		swapper.morphHead(second);
		swapper.replaceBody(second);
		swapper.flushScripts();

		await vi.waitFor(() => expect(runs).toContain('library'));
		await new Promise((resolve) => setTimeout(resolve, 50));
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

		swapper.morphHead(newDocument);
		swapper.morphBody(newDocument);
		swapper.flushScripts();

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

		swapper.morphHead(newDocument);
		swapper.replaceBody(newDocument);
		swapper.flushScripts();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(document.body.getAttribute('data-route-files')).toBe(
			'react-server-files/index.tsx,react-server-files/tree.server.ts',
		);
		expect(document.head.querySelectorAll('script#__ECO_PAGE_DATA__')).toHaveLength(1);
	});

	it('reuses registered rerun callbacks for external module scripts with stable ids', () => {
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

			swapper.morphHead(nextHtml);
			swapper.replaceBody(nextHtml);
			swapper.flushScripts();

			swapper.morphHead(nextHtml);
			swapper.replaceBody(nextHtml);
			swapper.flushScripts();
		} finally {
			document.head.appendChild = originalAppendChild;
			delete runtimeWindow.__ECO_PAGES__;
		}

		expect(rerun).toHaveBeenCalledTimes(2);
		expect(observedSrcs).toEqual(['/assets/counter.js']);
		expect(document.head.querySelectorAll('script[src*="/assets/counter.js"]')).toHaveLength(1);
	});

	it('falls back to a fresh URL for external module rerun scripts without stable ids', () => {
		resetDocument();
		const swapper = new DomSwapper('data-eco-persist');
		const observedSrcs: string[] = [];
		const originalAppendChild = document.head.appendChild.bind(document.head);

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
					'<script type="module" src="/assets/counter.js" data-eco-rerun="true"></script>',
					'</head><body><div id="content">Counter Page</div></body></html>',
				].join(''),
			);

			swapper.morphHead(nextHtml);
			swapper.replaceBody(nextHtml);
			swapper.flushScripts();

			swapper.morphHead(nextHtml);
			swapper.replaceBody(nextHtml);
			swapper.flushScripts();
		} finally {
			document.head.appendChild = originalAppendChild;
		}

		expect(observedSrcs[0]).toContain('__eco_rerun=1');
		expect(
			document.head.querySelector<HTMLScriptElement>('script[src*="/assets/counter.js"]')?.getAttribute('src'),
		).toContain('__eco_rerun=2');
		expect(document.head.querySelectorAll('script[src*="/assets/counter.js"]')).toHaveLength(1);
	});

	it('falls back to a fresh URL when a stable-id external module rerun script has no registered callback', () => {
		resetDocument();
		const swapper = new DomSwapper('data-eco-persist');
		const observedSrcs: string[] = [];
		const originalAppendChild = document.head.appendChild.bind(document.head);

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

			swapper.morphHead(nextHtml);
			swapper.replaceBody(nextHtml);
			swapper.flushScripts();

			swapper.morphHead(nextHtml);
			swapper.replaceBody(nextHtml);
			swapper.flushScripts();
		} finally {
			document.head.appendChild = originalAppendChild;
		}

		expect(observedSrcs[0]).toContain('__eco_rerun=1');
		expect(
			document.head.querySelector<HTMLScriptElement>('script[src*="/assets/counter.js"]')?.getAttribute('src'),
		).toContain('__eco_rerun=2');
		expect(document.head.querySelectorAll('script[src*="/assets/counter.js"]')).toHaveLength(1);
	});

	it('skips startViewTransition when no named transition elements are present', async () => {
		resetDocument();
		const manager = new ViewTransitionManager(true);
		const startViewTransition = vi.fn((callback: () => void | Promise<void>) => {
			const updateCallbackDone = Promise.resolve().then(async () => {
				await callback();
			});

			return {
				finished: Promise.resolve(),
				ready: Promise.resolve(),
				updateCallbackDone,
				skipTransition() {},
			};
		});

		Reflect.set(document as DocumentWithViewTransition, 'startViewTransition', startViewTransition);

		await manager.transition(() => {
			document.body.innerHTML = '<div>Updated</div>';
		});

		expect(startViewTransition).not.toHaveBeenCalled();
		expect(document.body.innerHTML).toContain('Updated');
	});

	it('ignores skipped view transition finish rejections after the DOM update commits', async () => {
		resetDocument();
		document.body.innerHTML = '<div data-view-transition="hero">Old</div>';
		const manager = new ViewTransitionManager(true);
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const startViewTransition = vi.fn((callback: () => void | Promise<void>) => {
			const updateCallbackDone = Promise.resolve().then(async () => {
				await callback();
			});

			return {
				finished: Promise.reject(new DOMException('Transition was skipped', 'AbortError')),
				ready: Promise.reject(new DOMException('Transition was skipped', 'AbortError')),
				updateCallbackDone,
				skipTransition() {},
			};
		});

		Reflect.set(document as DocumentWithViewTransition, 'startViewTransition', startViewTransition);

		await manager.transition(() => {
			document.body.innerHTML = '<div>Updated</div>';
		});
		await Promise.resolve();

		expect(startViewTransition).toHaveBeenCalledTimes(1);
		expect(document.body.innerHTML).toContain('Updated');
		expect(consoleSpy).not.toHaveBeenCalled();
	});

	it('injects persisted root styles when view transitions are enabled', () => {
		resetDocument();
		new ViewTransitionManager(true);

		const style = document.getElementById('eco-vt-root-styles');
		expect(style?.hasAttribute('data-eco-persist')).toBe(true);
		expect(style?.textContent).toContain('view-transition-name: none');
		expect(style?.textContent).not.toContain('!important');
	});

	it('does not inject root styles when view transitions are disabled', () => {
		resetDocument();
		new ViewTransitionManager(false);

		expect(document.getElementById('eco-vt-root-styles')).toBeNull();
	});
});
