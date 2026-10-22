import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ECO_DOCUMENT_OWNER_ATTRIBUTE } from '@ecopages/core/client';
import { extractProps, extractComponentUrl, loadPageModuleFromDocument } from '../src/navigation';
import { resolveReactNavigation } from '../src/navigation-orchestrator.ts';

/** Mirrors `DEV_TRANSFORM_URL_PREFIX` from `@ecopages/core/integration`. */
const DEV_TRANSFORM_URL_PREFIX = '/assets/__eco_dev__';

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

describe('loadPageModuleFromDocument', () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		if (typeof window !== 'undefined') {
			delete window.__ECO_PAGES__;
		}
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should return null when component URL cannot be extracted', async () => {
		const doc = createMockDocument('<html><body>No scripts</body></html>');

		const result = await loadPageModuleFromDocument(doc, '/test');

		expect(result).toBeNull();
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	it('should log when a marked react-router document is missing a component URL', async () => {
		const doc = createMockDocument(
			`<html ${ECO_DOCUMENT_OWNER_ATTRIBUTE}="react-router"><body>No scripts</body></html>`,
		);

		const result = await loadPageModuleFromDocument(doc, '/test');

		expect(result).toBeNull();
		expect(consoleErrorSpy).toHaveBeenCalledWith('[EcoRouter] Could not find component URL');
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
});

describe('resolveReactNavigation', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([404, 500])('uses a full navigation for an HTML %s response', async (status) => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(htmlPageResponse('<h1>Request failed</h1>', { status }));

		const outcome = await resolveReactNavigation({
			url: '/removed',
			signal: new AbortController().signal,
			isStale: () => false,
			isPopState: false,
			pushHistory: true,
		});

		expect(outcome).toEqual({ kind: 'hard-navigation', href: '/removed', mode: 'location' });
	});

	describe('when the page module fails', () => {
		const createPageHtml = (moduleUrl: string) =>
			`<html><body><script id="__ECO_PAGE_DATA__" type="application/json">${JSON.stringify({
				schemaVersion: 1,
				navigationOwner: 'react-router',
				moduleUrl,
				props: {},
			})}</script></body></html>`;

		it.each([
			['is missing', new URL('./fixtures/missing-page-module.ts', import.meta.url).toString()],
			['throws while evaluating', new URL('./fixtures/throwing-page-module.ts', import.meta.url).toString()],
		])('uses a full navigation and logs the error when the module %s', async (_name, moduleUrl) => {
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(htmlPageResponse(createPageHtml(moduleUrl)));
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const outcome = await resolveReactNavigation({
				url: '/broken',
				signal: new AbortController().signal,
				isStale: () => false,
				isPopState: false,
				pushHistory: true,
			});

			expect(outcome).toEqual({ kind: 'hard-navigation', href: '/broken', mode: 'location' });
			expect(errorSpy).toHaveBeenCalledWith('[EcoRouter] Failed to load the page module:', expect.any(Error));
		});

		it('does not fall back when the navigation was superseded while the module failed', async () => {
			const moduleUrl = new URL('./fixtures/throwing-page-module.ts', import.meta.url).toString();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(htmlPageResponse(createPageHtml(moduleUrl)));
			vi.spyOn(console, 'error').mockImplementation(() => {});

			const outcome = await resolveReactNavigation({
				url: '/superseded',
				signal: new AbortController().signal,
				isStale: vi.fn().mockReturnValueOnce(false).mockReturnValue(true),
				isPopState: false,
				pushHistory: true,
			});

			expect(outcome).toEqual({ kind: 'stale' });
		});
	});

	it('fetches the page on every visit instead of reusing the shared HTML cache', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation(async () => htmlPageResponse('<html><body>page</body></html>'));
		const input = {
			url: '/repeat',
			signal: new AbortController().signal,
			isStale: () => false,
			isPopState: false,
			pushHistory: true,
		};

		await resolveReactNavigation(input);
		await resolveReactNavigation(input);

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
