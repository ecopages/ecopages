import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProcessedAsset } from './asset-processing-service';
import { HtmlTransformerService } from './html-transformer.service';

type HtmlRewriterHandler = {
	element: (element: { append(content: string, options?: { html?: boolean }): void }) => void;
};

class TestHtmlRewriter {
	private handlers = new Map<'head' | 'body', HtmlRewriterHandler>();

	on(selector: 'head' | 'body', handler: HtmlRewriterHandler): TestHtmlRewriter {
		this.handlers.set(selector, handler);
		return this;
	}

	transform(response: Response): Response {
		const body = new ReadableStream<Uint8Array>({
			start: async (controller) => {
				const html = await response.text();
				let result = html;

				for (const selector of ['head', 'body'] as const) {
					const handler = this.handlers.get(selector);
					if (!handler) {
						continue;
					}

					const chunks: string[] = [];
					handler.element({
						append: (content) => {
							chunks.push(content);
						},
					});

					const closingTag = `</${selector}>`;
					result = result.replace(closingTag, `${chunks.join('')}${closingTag}`);
				}

				controller.enqueue(new TextEncoder().encode(result));
				controller.close();
			},
		});

		return new Response(body, {
			headers: response.headers,
			status: response.status,
			statusText: response.statusText,
		});
	}
}

vi.mock('@worker-tools/html-rewriter/base64', () => ({
	HTMLRewriter: TestHtmlRewriter,
}));

type HtmlRewriterModeScenario = {
	label: string;
	html: string;
	dependencies: ProcessedAsset[];
	expectedFragments: string[];
	unexpectedFragments?: string[];
};

type HtmlRewriterModeCase = {
	label: string;
	mode: 'auto' | 'native' | 'worker-tools' | 'fallback';
	hasNativeRuntime: boolean;
};

describe('HtmlTransformerService', () => {
	const originalHtmlRewriter = (globalThis as { HTMLRewriter?: typeof TestHtmlRewriter }).HTMLRewriter;

	afterEach(() => {
		(globalThis as { HTMLRewriter?: typeof TestHtmlRewriter }).HTMLRewriter = originalHtmlRewriter;
		vi.clearAllMocks();
	});

	const createMockResponse = (html: string) => {
		return new Response(html, {
			headers: { 'Content-Type': 'text/html' },
		});
	};

	const htmlRewriterModeCases: HtmlRewriterModeCase[] = [
		{ label: 'auto with native runtime', mode: 'auto', hasNativeRuntime: true },
		{ label: 'auto without native runtime', mode: 'auto', hasNativeRuntime: false },
		{ label: 'native', mode: 'native', hasNativeRuntime: true },
		{ label: 'worker-tools', mode: 'worker-tools', hasNativeRuntime: true },
		{ label: 'fallback', mode: 'fallback', hasNativeRuntime: true },
	];

	const htmlRewriterScenarios: HtmlRewriterModeScenario[] = [
		{
			label: 'injects mixed head and body dependencies while preserving document content',
			html: '<html><head><title>Matrix</title></head><body><main>Page content</main></body></html>',
			dependencies: [
				{
					kind: 'stylesheet',
					inline: false,
					position: 'head',
					srcUrl: '/matrix.css',
					attributes: { media: 'screen' },
				},
				{
					kind: 'script',
					inline: true,
					content: 'window.matrix = true;',
					position: 'head',
					srcUrl: '/matrix-inline.js',
					attributes: { id: 'matrix-inline' },
				},
				{
					kind: 'script',
					inline: false,
					position: 'body',
					srcUrl: '/matrix-body.js',
					attributes: { defer: 'true' },
				},
			],
			expectedFragments: [
				'<title>Matrix</title>',
				'<main>Page content</main>',
				'<link rel="stylesheet" href="/matrix.css" media="screen">',
				'<script id="matrix-inline">window.matrix = true;</script>',
				'<script src="/matrix-body.js" defer="true"></script>',
			],
		},
		{
			label: 'skips excluded scripts while still injecting remaining dependencies',
			html: '<html><head></head><body><section>Visible</section></body></html>',
			dependencies: [
				{
					kind: 'script',
					inline: false,
					position: 'body',
					srcUrl: '/excluded.js',
					excludeFromHtml: true,
				},
				{
					kind: 'script',
					inline: false,
					position: 'body',
					srcUrl: '/included.js',
				},
			],
			expectedFragments: ['<section>Visible</section>', '<script src="/included.js"></script>'],
			unexpectedFragments: ['<script src="/excluded.js"></script>'],
		},
		{
			label: 'injects inline styles and preserves nested body markup',
			html: '<html><head></head><body><div><span>Nested</span></div></body></html>',
			dependencies: [
				{
					kind: 'stylesheet',
					inline: true,
					position: 'head',
					content: '.nested{color:red;}',
					srcUrl: '/nested.css',
					attributes: { 'data-test': 'inline-style' },
				},
			],
			expectedFragments: [
				'<div><span>Nested</span></div>',
				'<style data-test="inline-style">.nested{color:red;}</style>',
			],
		},
	];

	it('should inject script dependencies correctly', async () => {
		const dependencies: ProcessedAsset[] = [
			{
				kind: 'script',
				inline: true,
				content: "console.log('test')",
				position: 'body',
				srcUrl: '/test.js',
				attributes: { id: 'test-script' },
			},
		];

		const transformer = new HtmlTransformerService();
		transformer.setProcessedDependencies(dependencies);
		const Response = createMockResponse('<html><head></head><body></body></html>');
		const result = await transformer.transform(Response);
		const html = await result.text();

		expect(html).toContain('<script id="test-script">console.log(\'test\')</script>');
	});

	it('should inject stylesheet dependencies correctly', async () => {
		const dependencies: ProcessedAsset[] = [
			{
				kind: 'stylesheet',
				inline: false,
				position: 'head',
				srcUrl: '/test.css',
				attributes: { media: 'screen' },
			},
		];

		const transformer = new HtmlTransformerService();
		transformer.setProcessedDependencies(dependencies);
		const Response = createMockResponse('<html><head></head><body></body></html>');
		const result = await transformer.transform(Response);
		const html = await result.text();

		expect(html).toContain('<link rel="stylesheet" href="/test.css" media="screen">');
	});

	it('should handle both inline and src dependencies', async () => {
		const dependencies: ProcessedAsset[] = [
			{
				kind: 'script',
				inline: true,
				content: 'const x = 1;',
				position: 'head',
				srcUrl: '/inline.js',
			},
			{
				kind: 'script',
				inline: false,
				position: 'body',
				srcUrl: '/external.js',
			},
		];

		const transformer = new HtmlTransformerService();
		transformer.setProcessedDependencies(dependencies);
		const Response = createMockResponse('<html><head></head><body></body></html>');
		const result = await transformer.transform(Response);
		const html = await result.text();

		expect(html).toContain('<script>const x = 1;</script>');
		expect(html).toContain('<script src="/external.js"></script>');
	});

	it('should preserve existing HTML content', async () => {
		const dependencies: ProcessedAsset[] = [
			{
				kind: 'script',
				inline: true,
				content: "console.log('test')",
				position: 'body',
				srcUrl: '/test.js',
			},
		];

		const originalHtml = '<html><head><title>Test</title></head><body><div>Content</div></body></html>';
		const transformer = new HtmlTransformerService();
		transformer.setProcessedDependencies(dependencies);
		const Response = createMockResponse(originalHtml);
		const result = await transformer.transform(Response);
		const html = await result.text();

		expect(html).toContain('<title>Test</title>');
		expect(html).toContain('<div>Content</div>');
		expect(html).toContain("console.log('test')");
	});

	it('should use native global HTMLRewriter when available', async () => {
		(globalThis as { HTMLRewriter?: typeof TestHtmlRewriter }).HTMLRewriter = TestHtmlRewriter;
		const dependencies: ProcessedAsset[] = [
			{
				kind: 'script',
				inline: false,
				position: 'body',
				srcUrl: '/native.js',
			},
		];

		const transformer = new HtmlTransformerService();
		transformer.setProcessedDependencies(dependencies);
		const result = await transformer.transform(createMockResponse('<html><head></head><body></body></html>'));
		const html = await result.text();

		expect(html).toContain('<script src="/native.js"></script>');
	});

	it('should fall back to worker-tools HTMLRewriter when no native runtime is available', async () => {
		(globalThis as { HTMLRewriter?: typeof TestHtmlRewriter }).HTMLRewriter = undefined;
		const dependencies: ProcessedAsset[] = [
			{
				kind: 'stylesheet',
				inline: false,
				position: 'head',
				srcUrl: '/worker-tools.css',
			},
		];

		const transformer = new HtmlTransformerService();
		transformer.setProcessedDependencies(dependencies);
		const result = await transformer.transform(createMockResponse('<html><head></head><body></body></html>'));
		const html = await result.text();

		expect(html).toContain('<link rel="stylesheet" href="/worker-tools.css">');
	});

	it('should allow forcing worker-tools mode even when native HTMLRewriter exists', async () => {
		(globalThis as { HTMLRewriter?: typeof TestHtmlRewriter }).HTMLRewriter = TestHtmlRewriter;
		const dependencies: ProcessedAsset[] = [
			{
				kind: 'stylesheet',
				inline: false,
				position: 'head',
				srcUrl: '/forced-worker-tools.css',
			},
		];

		const transformer = new HtmlTransformerService({ htmlRewriterMode: 'worker-tools' });
		transformer.setProcessedDependencies(dependencies);
		const result = await transformer.transform(createMockResponse('<html><head></head><body></body></html>'));
		const html = await result.text();

		expect(html).toContain('<link rel="stylesheet" href="/forced-worker-tools.css">');
	});

	it('should allow forcing worker-tools mode via setter after construction', async () => {
		(globalThis as { HTMLRewriter?: typeof TestHtmlRewriter }).HTMLRewriter = TestHtmlRewriter;
		const dependencies: ProcessedAsset[] = [
			{
				kind: 'stylesheet',
				inline: false,
				position: 'head',
				srcUrl: '/env-worker-tools.css',
			},
		];

		const transformer = new HtmlTransformerService();
		transformer.setHtmlRewriterMode('worker-tools');
		transformer.setProcessedDependencies(dependencies);
		const result = await transformer.transform(createMockResponse('<html><head></head><body></body></html>'));
		const html = await result.text();

		expect(html).toContain('<link rel="stylesheet" href="/env-worker-tools.css">');
	});

	it('should allow forcing string fallback mode', async () => {
		(globalThis as { HTMLRewriter?: typeof TestHtmlRewriter }).HTMLRewriter = TestHtmlRewriter;
		const dependencies: ProcessedAsset[] = [
			{
				kind: 'script',
				inline: false,
				position: 'body',
				srcUrl: '/fallback.js',
			},
		];

		const transformer = new HtmlTransformerService({ htmlRewriterMode: 'fallback' });
		transformer.setProcessedDependencies(dependencies);
		const result = await transformer.transform(createMockResponse('<html><head></head><body></body></html>'));
		const html = await result.text();

		expect(html).toContain('<script src="/fallback.js"></script>');
	});

	it('should allow forcing fallback mode via setter after construction', async () => {
		(globalThis as { HTMLRewriter?: typeof TestHtmlRewriter }).HTMLRewriter = TestHtmlRewriter;
		const dependencies: ProcessedAsset[] = [
			{
				kind: 'script',
				inline: false,
				position: 'body',
				srcUrl: '/env-fallback.js',
			},
		];

		const transformer = new HtmlTransformerService();
		transformer.setHtmlRewriterMode('fallback');
		transformer.setProcessedDependencies(dependencies);
		const result = await transformer.transform(createMockResponse('<html><head></head><body></body></html>'));
		const html = await result.text();

		expect(html).toContain('<script src="/env-fallback.js"></script>');
	});

	it('should support the same transformation scenarios across all html rewriter modes', async () => {
		const transformer = new HtmlTransformerService();

		for (const modeCase of htmlRewriterModeCases) {
			(globalThis as { HTMLRewriter?: typeof TestHtmlRewriter }).HTMLRewriter = modeCase.hasNativeRuntime
				? TestHtmlRewriter
				: undefined;

			for (const scenario of htmlRewriterScenarios) {
				transformer.setHtmlRewriterMode(modeCase.mode);
				transformer.setProcessedDependencies(scenario.dependencies);

				const result = await transformer.transform(createMockResponse(scenario.html));
				const html = await result.text();

				for (const expectedFragment of scenario.expectedFragments) {
					expect(html, `${modeCase.label}: ${scenario.label}`).toContain(expectedFragment);
				}

				for (const unexpectedFragment of scenario.unexpectedFragments ?? []) {
					expect(html, `${modeCase.label}: ${scenario.label}`).not.toContain(unexpectedFragment);
				}
			}
		}
	});

	it('should apply attributes to the html element', () => {
		const transformer = new HtmlTransformerService();
		const result = transformer.applyAttributesToHtmlElement(
			'<!DOCTYPE html><html lang="en"><body>Hello</body></html>',
			{
				'data-eco-document-owner': 'react-router',
			},
		);

		expect(result).toContain('<html lang="en" data-eco-document-owner="react-router">');
	});

	it('should apply attributes to the first body child', () => {
		const transformer = new HtmlTransformerService();
		const result = transformer.applyAttributesToFirstBodyElement(
			'<html><body><main>Hello</main><footer>Footer</footer></body></html>',
			{ 'data-eco-component-id': 'root-1', role: 'main' },
		);

		expect(result).toContain('<main data-eco-component-id="root-1" role="main">Hello</main>');
	});

	it('should apply attributes to the first fragment element', () => {
		const transformer = new HtmlTransformerService();
		const result = transformer.applyAttributesToFirstElement('   <aside>Content</aside><div>Other</div>', {
			'aria-live': 'polite',
		});

		expect(result).toContain('<aside aria-live="polite">Content</aside>');
	});

	it('should deduplicate processed assets while preserving order', () => {
		const transformer = new HtmlTransformerService();
		const first = { kind: 'script', srcUrl: '/assets/app.js', position: 'head' } as ProcessedAsset;
		const duplicate = { kind: 'script', srcUrl: '/assets/app.js', position: 'head' } as ProcessedAsset;
		const second = { kind: 'stylesheet', srcUrl: '/assets/app.css', position: 'head' } as ProcessedAsset;

		expect(transformer.dedupeProcessedAssets([first, duplicate, second])).toEqual([first, second]);
	});
});
