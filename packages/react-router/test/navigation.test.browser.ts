import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { extractProps } from '../src/navigation';

function createMockDocument(html: string): Document {
	return new DOMParser().parseFromString(html, 'text/html');
}

describe('extractProps', () => {
	it('should extract props from __ECO_PROPS__ script', () => {
		const html = `
			<html>
				<body>
					<script id="__ECO_PROPS__" type="application/json">
						{"title": "Test Page", "count": 42}
					</script>
				</body>
			</html>
		`;
		const doc = createMockDocument(html);
		const props = extractProps(doc);

		expect(props).toEqual({ title: 'Test Page', count: 42 });
	});

	it('should return empty object if props script is missing', () => {
		const html = '<html><body></body></html>';
		const doc = createMockDocument(html);
		const props = extractProps(doc);

		expect(props).toEqual({});
	});

	it('should return empty object if JSON is invalid', () => {
		const html = `
			<html>
				<body>
					<script id="__ECO_PROPS__">invalid json</script>
				</body>
			</html>
		`;
		const doc = createMockDocument(html);
		const props = extractProps(doc);

		expect(props).toEqual({});
	});

	it('should handle complex nested props', () => {
		const html = `
			<html>
				<body>
					<script id="__ECO_PROPS__" type="application/json">
						{
							"user": {"name": "John", "age": 30},
							"items": [1, 2, 3],
							"nested": {"deep": {"value": true}}
						}
					</script>
				</body>
			</html>
		`;
		const doc = createMockDocument(html);
		const props = extractProps(doc);

		expect(props).toEqual({
			user: { name: 'John', age: 30 },
			items: [1, 2, 3],
			nested: { deep: { value: true } },
		});
	});
});

describe('Cache busting in development', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.stubEnv('MODE', 'development');
		vi.stubEnv('PROD', false);
		fetchSpy = vi.spyOn(globalThis, 'fetch');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('should add cache buster timestamp to hydration script URL', async () => {
		const mockHtml = `
			<html>
				<body>
					<script type="module" src="/ecopages-react/hydration.js">
						import Content from './page.js';
					</script>
					<script id="__ECO_PROPS__" type="application/json">{}</script>
				</body>
			</html>
		`;

		fetchSpy.mockResolvedValue(new Response("import Content from './page.js';", { status: 200 }));

		const { extractComponentUrl } = await import('../src/navigation');
		const doc = createMockDocument(mockHtml);

		await extractComponentUrl(doc);

		const hydrationCalls = fetchSpy.mock.calls.filter((call: [RequestInfo | URL, RequestInit?]) =>
			call[0].toString().includes('hydration.js'),
		);

		expect(hydrationCalls.length).toBe(1);
		expect(hydrationCalls[0][0].toString()).toMatch(/hydration\.js\?t=\d+/);
	});

	it('should NOT add cache buster to initial page HTML fetch', async () => {
		const mockHtml = `
			<html>
				<body>
					<script type="module" src="/ecopages-react/hydration.js"></script>
					<script id="__ECO_PROPS__" type="application/json">{}</script>
				</body>
			</html>
		`;

		fetchSpy.mockResolvedValue(new Response(mockHtml, { status: 200 }));

		const { loadPageModule } = await import('../src/navigation');

		try {
			await loadPageModule('/about');
		} catch {
			// Expected to fail
		}

		const pageCalls = fetchSpy.mock.calls.filter((call: [RequestInfo | URL, RequestInit?]) =>
			call[0].toString().includes('/about'),
		);

		expect(pageCalls.length).toBe(1);
		expect(pageCalls[0][0].toString()).toBe('/about');
		expect(pageCalls[0][0].toString()).not.toMatch(/[?&]t=/);
	});
});
