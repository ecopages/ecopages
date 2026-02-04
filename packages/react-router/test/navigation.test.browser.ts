import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { extractProps, extractComponentUrl, loadPageModule, shouldInterceptClick } from '../src/navigation';
import { DEFAULT_OPTIONS } from '../src/types';

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
			delete window.__ECO_PAGE__;
		}
	});

	it('should extract props from window.__ECO_PAGE__ for current document', () => {
		if (typeof window === 'undefined') return;

		window.__ECO_PAGE__ = {
			module: '/page.js',
			props: { title: 'Test Page', count: 42 },
		};

		const props = extractProps(document);
		expect(props).toEqual({ title: 'Test Page', count: 42 });
	});

	it('should handle nested props correctly', () => {
		if (typeof window === 'undefined') return;

		window.__ECO_PAGE__ = {
			module: '/page.js',
			props: {
				user: { name: 'John', age: 30 },
				items: [1, 2, 3],
				metadata: { tags: ['a', 'b'] },
			},
		};

		const props = extractProps(document);
		expect(props).toEqual({
			user: { name: 'John', age: 30 },
			items: [1, 2, 3],
			metadata: { tags: ['a', 'b'] },
		});
	});

	it('should return empty object when window.__ECO_PAGE__ is undefined', () => {
		if (typeof window === 'undefined') return;

		const props = extractProps(document);
		expect(props).toEqual({});
	});

	it('should return empty object when window.__ECO_PAGE__.props is undefined', () => {
		if (typeof window === 'undefined') return;

		window.__ECO_PAGE__ = {
			module: '/page.js',
			props: undefined as any,
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
			delete (window as any).__ECO_PAGE__;
		}
	});

	it('should extract component URL from window.__ECO_PAGE__ for current document', async () => {
		if (typeof window === 'undefined') return;

		window.__ECO_PAGE__ = {
			module: '/_hmr/pages/about.js',
			props: {},
		};

		const url = await extractComponentUrl(document);
		expect(url).toBe('/_hmr/pages/about.js');
	});

	it('should handle component URLs with query parameters', async () => {
		if (typeof window === 'undefined') return;

		window.__ECO_PAGE__ = {
			module: '/_hmr/pages/about.js?version=1',
			props: {},
		};

		const url = await extractComponentUrl(document);
		expect(url).toBe('/_hmr/pages/about.js?version=1');
	});

	it('should return null when window.__ECO_PAGE__ is missing', async () => {
		if (typeof window === 'undefined') return;

		const url = await extractComponentUrl(document);
		expect(url).toBeNull();
	});

	it('should return null when window.__ECO_PAGE__.module is missing', async () => {
		if (typeof window === 'undefined') return;

		window.__ECO_PAGE__ = {
			module: undefined as any,
			props: {},
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

	it('should extract from inline hydration script in fetched document', async () => {
		const html = `
			<html>
				<body>
					<script type="module" src="/ecopages-react/hydration.js">
						import Content from './pages/about.js';
					</script>
				</body>
			</html>
		`;
		const doc = createMockDocument(html);

		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response("import Content from './pages/about.js';", { status: 200 }));

		const url = await extractComponentUrl(doc);
		expect(url).toBe('./pages/about.js');

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
			delete window.__ECO_PAGE__;
		}
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should return null when component URL cannot be extracted', async () => {
		const mockHtml = '<html><body>No scripts</body></html>';
		fetchSpy.mockResolvedValueOnce(new Response(mockHtml, { status: 200 }));

		const result = await loadPageModule('/test');

		expect(result).toBeNull();
		expect(consoleErrorSpy).toHaveBeenCalled();
	});

	it('should handle fetch errors gracefully', async () => {
		fetchSpy.mockRejectedValueOnce(new Error('Network error'));

		const result = await loadPageModule('/test');

		expect(result).toBeNull();
		expect(consoleErrorSpy).toHaveBeenCalledWith('[EcoRouter] Navigation failed:', expect.any(Error));
	});
});

describe('shouldInterceptClick', () => {
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

		const result = shouldInterceptClick(event, link, options);

		expect(result).toBe(true);
	});

	it('should not intercept clicks with modifier keys (ctrl)', () => {
		const link = createLink('/about');
		links.push(link);

		const result = shouldInterceptClick(createMouseEvent({ ctrlKey: true }), link, options);
		expect(result).toBe(false);
	});

	it('should not intercept clicks with modifier keys (meta)', () => {
		const link = createLink('/about');
		links.push(link);

		const result = shouldInterceptClick(createMouseEvent({ metaKey: true }), link, options);
		expect(result).toBe(false);
	});

	it('should not intercept non-left clicks', () => {
		const link = createLink('/about');
		links.push(link);
		const event = createMouseEvent({ button: 1 });

		const result = shouldInterceptClick(event, link, options);

		expect(result).toBe(false);
	});

	it('should not intercept external links', () => {
		const link = createLink('https://external.com/page');
		links.push(link);
		const event = createMouseEvent();

		const result = shouldInterceptClick(event, link, options);

		expect(result).toBe(false);
	});

	it('should not intercept links with target attribute', () => {
		const link = createLink('/about', { target: '_blank' });
		links.push(link);
		const event = createMouseEvent();

		const result = shouldInterceptClick(event, link, options);

		expect(result).toBe(false);
	});

	it('should not intercept links with download attribute', () => {
		const link = createLink('/file.pdf', { download: 'file.pdf' });
		links.push(link);
		const event = createMouseEvent();

		const result = shouldInterceptClick(event, link, options);

		expect(result).toBe(false);
	});

	it('should not intercept links with reload attribute', () => {
		const link = createLink('/about', { 'data-eco-reload': 'true' });
		links.push(link);
		const event = createMouseEvent();

		const result = shouldInterceptClick(event, link, options);

		expect(result).toBe(false);
	});

	it('should not intercept hash-only links', () => {
		const link = createLink('#section');
		links.push(link);
		const event = createMouseEvent();

		const result = shouldInterceptClick(event, link, options);

		expect(result).toBe(false);
	});

	it('should not intercept mailto links', () => {
		const link = createLink('mailto:test@example.com');
		links.push(link);
		const event = createMouseEvent();

		const result = shouldInterceptClick(event, link, options);

		expect(result).toBe(false);
	});

	it('should not intercept tel links', () => {
		const link = createLink('tel:+1234567890');
		links.push(link);
		const event = createMouseEvent();

		const result = shouldInterceptClick(event, link, options);

		expect(result).toBe(false);
	});
});

describe('Cache busting in development', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		fetchSpy = vi.spyOn(globalThis, 'fetch');
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should add cache buster timestamp to hydration script URL in development', async () => {
		const mockHtml = `
			<html>
				<body>
					<script type="module" src="/ecopages-react/hydration.js">
						import Content from './page.js';
					</script>
				</body>
			</html>
		`;

		fetchSpy.mockResolvedValue(new Response("import Content from './page.js';", { status: 200 }));

		const doc = createMockDocument(mockHtml);
		await extractComponentUrl(doc);

		const hydrationCalls = fetchSpy.mock.calls.filter((call: [RequestInfo | URL, RequestInit?]) =>
			call[0].toString().includes('hydration.js'),
		);

		expect(hydrationCalls.length).toBe(1);
		expect(hydrationCalls[0][0].toString()).toMatch(/hydration\.js\?t=\d+/);
	});
});
