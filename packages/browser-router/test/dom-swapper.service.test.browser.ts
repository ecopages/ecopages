import { describe, expect, it } from 'vitest';
import { DomSwapper } from '../src/client/services/dom-swapper.ts';

function parseDocument(html: string): Document {
	return new DOMParser().parseFromString(html, 'text/html');
}

function resetDocument(): void {
	document.head.innerHTML = '';
	document.body.innerHTML = '';
	document.title = '';
}

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
		swapper.flushRerunScripts();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(document.head.querySelector('script[src="/old-script.js"]')).toBeNull();
		expect(document.head.querySelector('script[src="/next-script.js"]')).not.toBeNull();
		expect(document.head.querySelector('script[src="/persisted.js"][data-eco-persist="true"]')).not.toBeNull();
		expect(document.head.querySelectorAll('script[data-eco-script-id="stable-script"]')).toHaveLength(1);
		expect((window as typeof window & { __stable_script_runs__?: number }).__stable_script_runs__).toBe(1);
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
		swapper.flushRerunScripts();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(document.body.getAttribute('data-route-files')).toBe(
			'react-server-files/index.tsx,react-server-files/tree.server.ts',
		);
		expect(document.head.querySelectorAll('script#__ECO_PAGE_DATA__')).toHaveLength(1);
	});

	it('re-executes external module rerun scripts with a fresh URL on each navigation', () => {
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
			swapper.flushRerunScripts();

			swapper.morphHead(nextHtml);
			swapper.replaceBody(nextHtml);
			swapper.flushRerunScripts();
		} finally {
			document.head.appendChild = originalAppendChild;
		}

		expect(observedSrcs[0]).toContain('__eco_rerun=1');
		expect(
			document.head.querySelector<HTMLScriptElement>('script[src*="/assets/counter.js"]')?.getAttribute('src'),
		).toContain('__eco_rerun=2');
		expect(document.head.querySelectorAll('script[src*="/assets/counter.js"]')).toHaveLength(1);
	});
});
