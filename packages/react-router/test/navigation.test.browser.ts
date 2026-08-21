import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ECO_DOCUMENT_OWNER_ATTRIBUTE } from '@ecopages/core/router/navigation-coordinator';
import { getLinkNavigationDecision, isSamePageHashNavigationHref } from '@ecopages/core/router/link-navigation-policy';
import {
	extractProps,
	extractComponentUrl,
	fetchPageDocument,
	loadPageModule,
	loadPageModuleFromDocument,
} from '../src/navigation';
import { DEFAULT_OPTIONS } from '../src/types';

/** Mirrors `DEV_TRANSFORM_URL_PREFIX` from `@ecopages/core/hmr/hmr-asset-paths`. */
const DEV_TRANSFORM_URL_PREFIX = '/assets/__eco_dev__';

function linkNavigationPolicyOptions(options: typeof DEFAULT_OPTIONS) {
	return { reloadAttribute: options.reloadAttribute };
}

function htmlPageResponse(body: string, init: ResponseInit = {}): Response {
	return new Response(body, {
		status: 200,
		...init,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			...(init.headers ?? {}),
		},
	});
}

function createMockDocument(html: string): Document {
	return new DOMParser().parseFromString(html, 'text/html');
}

function createLink(href: string, attributes: Record<string, string> = {}): HTMLAnchorElement {
	const link = document.createElement('a');
	link.href = href;
	for (const [key, value] of Object.entries(attributes)) {
		link.setAttribute(key, value);
	}
	document.body.appendChild(link);
	return link;
}

function createMouseEvent(overrides: Partial<MouseEventInit> = {}): MouseEvent {
	return new MouseEvent('click', {
		button: 0,
		bubbles: true,
		cancelable: true,
		...overrides,
	});
}

describe('extractProps', () => {
	beforeEach(() => {
		if (typeof window !== 'undefined') {
			delete window.__ECO_PAGES__;
		}
	});

	it('should extract props from window.__ECO_PAGES__.page for current document', () => {
		if (typeof window === 'undefined') return;

		window.__ECO_PAGES__ = {
			...window.__ECO_PAGES__,
			page: {
				module: '/page.js',
				props: { title: 'Test Page', count: 42 },
			},
		};

		const props = extractProps(document);
		expect(props).toEqual({ title: 'Test Page', count: 42 });
	});

	it('should handle nested props correctly', () => {
		if (typeof window === 'undefined') return;

		window.__ECO_PAGES__ = {
			...window.__ECO_PAGES__,
			page: {
				module: '/page.js',
				props: {
					user: { name: 'John', age: 30 },
					items: [1, 2, 3],
					metadata: { tags: ['a', 'b'] },
				},
			},
		};

		const props = extractProps(document);
		expect(props).toEqual({
			user: { name: 'John', age: 30 },
			items: [1, 2, 3],
			metadata: { tags: ['a', 'b'] },
		});
	});

	it('should return empty object when window.__ECO_PAGES__.page is undefined', () => {
		if (typeof window === 'undefined') return;

		const props = extractProps(document);
		expect(props).toEqual({});
	});

	it('should return empty object when window.__ECO_PAGES__.page.props is undefined', () => {
		if (typeof window === 'undefined') return;

		window.__ECO_PAGES__ = {
			...window.__ECO_PAGES__,
			page: {
				module: '/page.js',
				props: undefined as any,
			},
		};

		const props = extractProps(document);
		expect(props).toEqual({});
	});

	it('should return empty object for fetched documents without props script', () => {
		const html = '<html><body></body></html>';
		const doc = createMockDocument(html);
		const props = extractProps(doc);
		expect(props).toEqual({});
	});

	it('should extract props from __ECO_PAGE_DATA__ JSON script for fetched documents', () => {
		const html = `
			<html>
				<body>
					<script id="__ECO_PAGE_DATA__" type="application/json">{"params":{"slug":"test-post"},"query":{}}</script>
				</body>
			</html>
		`;
		const doc = createMockDocument(html);
		const props = extractProps(doc);
		expect(props).toEqual({ params: { slug: 'test-post' }, query: {} });
	});

	it('should extract props from a v1 page-data envelope', () => {
		const doc = createMockDocument(`
			<html><body>
				<script id="__ECO_PAGE_DATA__" type="application/json">
					{"schemaVersion":1,"navigationOwner":"react-router","moduleUrl":"/assets/docs.js","props":{"slug":"intro"}}
				</script>
			</body></html>
		`);

		expect(extractProps(doc)).toEqual({ slug: 'intro' });
	});

	it('should ignore legacy fallback props scripts for fetched documents', () => {
		const html = `
			<html>
				<body>
					<script id="__ECO_PAGE_DATA_FALLBACK__" type="application/json">{"params":{"slug":"legacy"}}</script>
				</body>
			</html>
		`;
		const doc = createMockDocument(html);
		const props = extractProps(doc);
		expect(props).toEqual({});
	});

	it('should handle complex nested props from JSON script', () => {
		const html = `
			<html>
				<body>
					<script id="__ECO_PAGE_DATA__" type="application/json">{"user":{"name":"John","roles":["admin","user"]},"items":[1,2,3]}</script>
				</body>
			</html>
		`;
		const doc = createMockDocument(html);
		const props = extractProps(doc);
		expect(props).toEqual({
			user: { name: 'John', roles: ['admin', 'user'] },
			items: [1, 2, 3],
		});
	});

	it('should return empty object for invalid JSON in props script', () => {
		const html = `
			<html>
				<body>
					<script id="__ECO_PAGE_DATA__" type="application/json">not valid json</script>
				</body>
			</html>
		`;
		const doc = createMockDocument(html);
		const props = extractProps(doc);
		expect(props).toEqual({});
	});
});

describe('extractComponentUrl', () => {
	beforeEach(() => {
		if (typeof window !== 'undefined') {
			delete window.__ECO_PAGES__;
		}
	});

	it('should extract component URL from window.__ECO_PAGES__.page for current document', async () => {
		if (typeof window === 'undefined') return;

		const pageModuleUrl = `${DEV_TRANSFORM_URL_PREFIX}/pages/about.js`;

		window.__ECO_PAGES__ = {
			...window.__ECO_PAGES__,
			page: {
				module: pageModuleUrl,
				props: {},
			},
		};

		const url = await extractComponentUrl(document);
		expect(url).toBe(pageModuleUrl);
	});

	it('should handle component URLs with query parameters', async () => {
		if (typeof window === 'undefined') return;

		const pageModuleUrl = `${DEV_TRANSFORM_URL_PREFIX}/pages/about.js?version=1`;

		window.__ECO_PAGES__ = {
			...window.__ECO_PAGES__,
			page: {
				module: pageModuleUrl,
				props: {},
			},
		};

		const url = await extractComponentUrl(document);
		expect(url).toBe(pageModuleUrl);
	});

	it('should return null when window.__ECO_PAGES__.page is missing', async () => {
		if (typeof window === 'undefined') return;

		const url = await extractComponentUrl(document);
		expect(url).toBeNull();
	});

	it('should return null when window.__ECO_PAGES__.page.module is missing', async () => {
		if (typeof window === 'undefined') return;

		window.__ECO_PAGES__ = {
			...window.__ECO_PAGES__,
			page: {
				module: undefined as any,
				props: {},
			},
		};

		const url = await extractComponentUrl(document);
		expect(url).toBeNull();
	});

	it('should return null for fetched documents without hydration script', async () => {
		const html = '<html><body><div>No scripts here</div></body></html>';
		const doc = createMockDocument(html);
		const url = await extractComponentUrl(doc);
		expect(url).toBeNull();
	});

	it('should discover the page module from a v1 page-data envelope', async () => {
		const doc = createMockDocument(`
			<html><body>
				<script id="__ECO_PAGE_DATA__" type="application/json">
					{"schemaVersion":1,"navigationOwner":"react-router","moduleUrl":"/assets/pages/docs.js","props":{}}
				</script>
			</body></html>
		`);
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		expect(extractComponentUrl(doc)).toBe('/assets/pages/docs.js');
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});

	it('should use the explicit page bootstrap script src when the envelope is absent', async () => {
		const doc = createMockDocument(`
			<html>
				<body>
					<script src="/assets/grouped/react-pages-dashboard.js" type="module" data-eco-page-bootstrap="react-router"></script>
				</body>
			</html>
		`);
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		const url = await extractComponentUrl(doc);
		expect(url).toBe(`${window.location.origin}/assets/grouped/react-pages-dashboard.js`);
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});

	it('should ignore hydration scripts that are not the page bootstrap entry', async () => {
		const html = `
			<html>
				<body>
					<script src="/assets/scripts/ecopages-react-123-hydration.js" type="module"></script>
					<script src="/assets/scripts/ecopages-react-island-123-hydration.js" type="module"></script>
				</body>
			</html>
		`;
		const doc = createMockDocument(html);
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		const url = await extractComponentUrl(doc);
		expect(url).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});
});

describe('loadPageModule', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		fetchSpy = vi.spyOn(globalThis, 'fetch');
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		if (typeof window !== 'undefined') {
			delete window.__ECO_PAGES__;
		}
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should return null when component URL cannot be extracted', async () => {
		const mockHtml = '<html><body>No scripts</body></html>';
		fetchSpy.mockResolvedValueOnce(htmlPageResponse(mockHtml));

		const result = await loadPageModule('/test');

		expect(result).toBeNull();
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	it('should log when a marked react-router document is missing a component URL', async () => {
		const mockHtml = `<html ${ECO_DOCUMENT_OWNER_ATTRIBUTE}="react-router"><body>No scripts</body></html>`;
		fetchSpy.mockResolvedValueOnce(htmlPageResponse(mockHtml));

		const result = await loadPageModule('/test');

		expect(result).toBeNull();
		expect(consoleErrorSpy).toHaveBeenCalledWith('[EcoRouter] Could not find component URL');
	});

	it('should handle fetch errors gracefully', async () => {
		fetchSpy.mockRejectedValueOnce(new Error('Network error'));

		const result = await loadPageModule('/test');

		expect(result).toBeNull();
		expect(consoleErrorSpy).toHaveBeenCalledWith('[EcoRouter] Navigation failed:', expect.any(Error));
	});

	it('should return null without logging when the navigation fetch is aborted', async () => {
		const abortController = new AbortController();
		fetchSpy.mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));

		const result = await loadPageModule('/test', { signal: abortController.signal });

		expect(result).toBeNull();
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	it('should fetch and parse a navigation document without loading a module', async () => {
		const mockHtml = '<html><body><main>Outside React</main></body></html>';
		fetchSpy.mockResolvedValueOnce(htmlPageResponse(mockHtml));

		const result = await fetchPageDocument('/docs');

		expect(result).toEqual({
			doc: expect.any(Document),
			finalPath: '/docs',
			html: mockHtml,
		});
		expect(result?.doc.body.innerHTML).toContain('Outside React');
	});

	it('should request navigation documents as HTML', async () => {
		const mockHtml = '<html><body><main>Docs</main></body></html>';
		fetchSpy.mockResolvedValueOnce(htmlPageResponse(mockHtml));

		await fetchPageDocument('/docs');

		expect(fetchSpy).toHaveBeenCalledWith('/docs', {
			signal: undefined,
			headers: {
				Accept: 'text/html',
			},
		});
	});

	it('should load a react page module from an already-fetched document', async () => {
		const moduleUrl = '/packages/react-router/test/fixtures/test-page-module.ts';
		const doc = createMockDocument(
			[
				`<html ${ECO_DOCUMENT_OWNER_ATTRIBUTE}="react-router">`,
				'<body>',
				`<script id="__ECO_PAGE_DATA__" type="application/json">{"schemaVersion":1,"navigationOwner":"react-router","moduleUrl":"${moduleUrl}","props":{"message":"hello"}}</script>`,
				'</body>',
				'</html>',
			].join(''),
		);

		const result = await loadPageModuleFromDocument(doc, '/test');

		expect(result?.props).toEqual({ message: 'hello' });
		expect(result?.doc).toBe(doc);
		expect(result?.finalPath).toBe('/test');
		expect(result?.moduleUrl).toBe(moduleUrl);
		expect(typeof result?.Component).toBe('function');
	});

	it('should prefer a provided module URL override when loading a fetched document', async () => {
		const moduleUrl = '/packages/react-router/test/fixtures/test-page-module.ts';
		const doc = createMockDocument(
			[
				`<html ${ECO_DOCUMENT_OWNER_ATTRIBUTE}="react-router">`,
				'<body>',
				'<script id="__ECO_PAGE_DATA__" type="application/json">{"message":"override"}</script>',
				'<script src="/assets/ecopages-react-stale.js" type="module"></script>',
				'</body>',
				'</html>',
			].join(''),
		);

		const result = await loadPageModuleFromDocument(doc, '/test', {
			moduleUrlOverride: moduleUrl,
		});

		expect(result?.props).toEqual({ message: 'override' });
		expect(result?.moduleUrl).toBe(moduleUrl);
		expect(typeof result?.Component).toBe('function');
	});

	it('awaits the Page preload export before returning the loaded module', async () => {
		const moduleUrl = '/packages/react-router/test/fixtures/preload-page-module.ts';
		const { getPreloadFixtureState, resetPreloadFixture } = await import('./fixtures/preload-page-module.ts');
		resetPreloadFixture();

		const doc = createMockDocument(
			[
				`<html ${ECO_DOCUMENT_OWNER_ATTRIBUTE}="react-router">`,
				'<body>',
				`<script id="__ECO_PAGE_DATA__" type="application/json">{"schemaVersion":1,"navigationOwner":"react-router","moduleUrl":"${moduleUrl}","props":{"slug":"hello-world"}}</script>`,
				'</body>',
				'</html>',
			].join(''),
		);

		const loadPromise = loadPageModuleFromDocument(doc, '/posts/hello-world');
		const state = getPreloadFixtureState();

		await vi.waitFor(() => {
			expect(state.started).toBe(true);
		});
		expect(state.completed).toBe(false);
		expect(state.props).toEqual({ slug: 'hello-world' });

		const settledEarly = await Promise.race([
			loadPromise.then(() => true),
			new Promise<false>((resolve) => {
				setTimeout(() => resolve(false), 20);
			}),
		]);
		expect(settledEarly).toBe(false);

		state.release?.();
		const result = await loadPromise;

		expect(state.completed).toBe(true);
		expect(typeof result?.preload).toBe('function');
		expect(typeof result?.Component).toBe('function');
	});
});

describe('getLinkNavigationDecision', () => {
	const options = DEFAULT_OPTIONS;
	let links: HTMLAnchorElement[] = [];

	beforeEach(() => {
		links = [];
	});

	afterEach(() => {
		links.forEach((link) => link.remove());
		links = [];
	});

	it('should intercept normal same-origin clicks', () => {
		const link = createLink('/about');
		links.push(link);
		const event = createMouseEvent();

		const result = getLinkNavigationDecision(event, link, linkNavigationPolicyOptions(options)).shouldIntercept;

		expect(result).toBe(true);
	});

	it('should not intercept clicks with modifier keys (ctrl)', () => {
		const link = createLink('/about');
		links.push(link);

		const result = getLinkNavigationDecision(
			createMouseEvent({ ctrlKey: true }),
			link,
			linkNavigationPolicyOptions(options),
		).shouldIntercept;
		expect(result).toBe(false);
	});

	it('should not intercept clicks with modifier keys (meta)', () => {
		const link = createLink('/about');
		links.push(link);

		const result = getLinkNavigationDecision(
			createMouseEvent({ metaKey: true }),
			link,
			linkNavigationPolicyOptions(options),
		).shouldIntercept;
		expect(result).toBe(false);
	});

	it('should not intercept non-left clicks', () => {
		const link = createLink('/about');
		links.push(link);
		const event = createMouseEvent({ button: 1 });

		const result = getLinkNavigationDecision(event, link, linkNavigationPolicyOptions(options)).shouldIntercept;

		expect(result).toBe(false);
	});

	it('should not intercept external links', () => {
		const link = createLink('https://external.com/page');
		links.push(link);
		const event = createMouseEvent();

		const result = getLinkNavigationDecision(event, link, linkNavigationPolicyOptions(options)).shouldIntercept;

		expect(result).toBe(false);
	});

	it('should not intercept links with target attribute', () => {
		const link = createLink('/about', { target: '_blank' });
		links.push(link);
		const event = createMouseEvent();

		const result = getLinkNavigationDecision(event, link, linkNavigationPolicyOptions(options)).shouldIntercept;

		expect(result).toBe(false);
	});

	it('should not intercept links with download attribute', () => {
		const link = createLink('/file.pdf', { download: 'file.pdf' });
		links.push(link);
		const event = createMouseEvent();

		const result = getLinkNavigationDecision(event, link, linkNavigationPolicyOptions(options)).shouldIntercept;

		expect(result).toBe(false);
	});

	it('should not intercept links to static asset files', () => {
		for (const href of ['/skill.txt', '/skill/reference/full-stack.md']) {
			const link = createLink(href);
			links.push(link);
			const event = createMouseEvent();

			expect(getLinkNavigationDecision(event, link, linkNavigationPolicyOptions(options)).shouldIntercept).toBe(
				false,
			);
			expect(getLinkNavigationDecision(event, link, linkNavigationPolicyOptions(options))).toEqual({
				shouldIntercept: false,
				reason: 'static-asset',
			});
		}
	});

	it('should not intercept links with reload attribute', () => {
		const link = createLink('/about', { 'data-eco-reload': 'true' });
		links.push(link);
		const event = createMouseEvent();

		const result = getLinkNavigationDecision(event, link, linkNavigationPolicyOptions(options)).shouldIntercept;

		expect(result).toBe(false);
	});

	it('should not intercept hash-only links', () => {
		const link = createLink('#section');
		links.push(link);
		const event = createMouseEvent();

		const result = getLinkNavigationDecision(event, link, linkNavigationPolicyOptions(options)).shouldIntercept;

		expect(result).toBe(false);
	});

	it('should not intercept same-page links that only add a hash fragment', () => {
		window.history.replaceState({}, '', `${window.location.origin}/docs/ecosystem/browser-router`);
		const link = createLink('/docs/ecosystem/browser-router#setup');
		links.push(link);

		const result = getLinkNavigationDecision(
			createMouseEvent(),
			link,
			linkNavigationPolicyOptions(options),
		).shouldIntercept;

		expect(result).toBe(false);
		expect(isSamePageHashNavigationHref('/docs/ecosystem/browser-router#setup')).toBe(true);
	});

	it('should not intercept mailto links', () => {
		const link = createLink('mailto:test@example.com');
		links.push(link);
		const event = createMouseEvent();

		const result = getLinkNavigationDecision(event, link, linkNavigationPolicyOptions(options)).shouldIntercept;

		expect(result).toBe(false);
	});

	it('should not intercept tel links', () => {
		const link = createLink('tel:+1234567890');
		links.push(link);
		const event = createMouseEvent();

		const result = getLinkNavigationDecision(event, link, linkNavigationPolicyOptions(options)).shouldIntercept;

		expect(result).toBe(false);
	});
});
