import { describe, expect, it } from 'vitest';
import type { ProcessedAsset } from '../assets/asset-processing-service/index.js';
import { HtmlTransformerService } from './html-transformer.service.ts';
import type {
	HtmlRewriterElement,
	HtmlRewriterMode,
	HtmlRewriterProvider,
	HtmlRewriterRuntime,
} from './html-rewriter-provider.service.ts';

type HtmlRewriterHandler = {
	element: (element: HtmlRewriterElement) => void;
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
						append: (content: string) => {
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

class TestHtmlRewriterProvider implements HtmlRewriterProvider {
	public mode: HtmlRewriterMode = 'auto';

	setMode(mode: HtmlRewriterMode) {
		this.mode = mode;
	}

	async createHtmlRewriter(): Promise<HtmlRewriterRuntime | null> {
		return this.mode === 'fallback' ? null : new TestHtmlRewriter();
	}
}

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
};

describe('HtmlTransformerService', () => {
	const createMockResponse = (html: string) => {
		return new Response(html, {
			headers: { 'Content-Type': 'text/html' },
		});
	};

	const createTransformer = (mode: HtmlRewriterMode = 'auto') => {
		const htmlRewriterProvider = new TestHtmlRewriterProvider();
		const transformer = new HtmlTransformerService({ htmlRewriterMode: mode, htmlRewriterProvider });
		return { transformer, htmlRewriterProvider };
	};

	const htmlRewriterModeCases: HtmlRewriterModeCase[] = [
		{ label: 'auto', mode: 'auto' },
		{ label: 'native', mode: 'native' },
		{ label: 'worker-tools', mode: 'worker-tools' },
		{ label: 'fallback', mode: 'fallback' },
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

		const { transformer } = createTransformer();
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

		const { transformer } = createTransformer();
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

		const { transformer } = createTransformer();
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
		const { transformer } = createTransformer();
		transformer.setProcessedDependencies(dependencies);
		const Response = createMockResponse(originalHtml);
		const result = await transformer.transform(Response);
		const html = await result.text();

		expect(html).toContain('<title>Test</title>');
		expect(html).toContain('<div>Content</div>');
		expect(html).toContain("console.log('test')");
	});

	it('should use the injected html rewriter provider when available', async () => {
		const dependencies: ProcessedAsset[] = [
			{
				kind: 'script',
				inline: false,
				position: 'body',
				srcUrl: '/native.js',
			},
		];

		const { transformer } = createTransformer();
		transformer.setProcessedDependencies(dependencies);
		const result = await transformer.transform(createMockResponse('<html><head></head><body></body></html>'));
		const html = await result.text();

		expect(html).toContain('<script src="/native.js"></script>');
	});

	it('should fall back to string injection when the provider returns no rewriter', async () => {
		const dependencies: ProcessedAsset[] = [
			{
				kind: 'stylesheet',
				inline: false,
				position: 'head',
				srcUrl: '/worker-tools.css',
			},
		];

		const { transformer } = createTransformer('fallback');
		transformer.setProcessedDependencies(dependencies);
		const result = await transformer.transform(createMockResponse('<html><head></head><body></body></html>'));
		const html = await result.text();

		expect(html).toContain('<link rel="stylesheet" href="/worker-tools.css">');
	});

	it('should delegate html rewriter mode changes to the injected provider', () => {
		const { transformer, htmlRewriterProvider } = createTransformer();

		transformer.setHtmlRewriterMode('worker-tools');
		expect(htmlRewriterProvider.mode).toBe('worker-tools');

		transformer.setHtmlRewriterMode('fallback');
		expect(htmlRewriterProvider.mode).toBe('fallback');
	});

	it('should support the same transformation scenarios across all html rewriter modes', async () => {
		for (const modeCase of htmlRewriterModeCases) {
			const { transformer } = createTransformer(modeCase.mode);

			for (const scenario of htmlRewriterScenarios) {
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
		const { transformer } = createTransformer();
		const result = transformer.applyAttributesToHtmlElement(
			'<!DOCTYPE html><html lang="en"><body>Hello</body></html>',
			{
				'data-eco-document-owner': 'react-router',
			},
		);

		expect(result).toContain('<html lang="en" data-eco-document-owner="react-router">');
	});

	it('should apply attributes to the first body child', () => {
		const { transformer } = createTransformer();
		const result = transformer.applyAttributesToFirstBodyElement(
			'<html><body><main>Hello</main><footer>Footer</footer></body></html>',
			{ 'data-eco-component-id': 'root-1', role: 'main' },
		);

		expect(result).toContain('<main data-eco-component-id="root-1" role="main">Hello</main>');
	});

	it('should apply attributes to the first fragment element', () => {
		const { transformer } = createTransformer();
		const result = transformer.applyAttributesToFirstElement('   <aside>Content</aside><div>Other</div>', {
			'aria-live': 'polite',
		});

		expect(result).toContain('<aside aria-live="polite">Content</aside>');
	});

	it('should deduplicate processed assets while preserving order', () => {
		const { transformer } = createTransformer();
		const first = { kind: 'script', srcUrl: '/assets/app.js', position: 'head' } as ProcessedAsset;
		const duplicate = { kind: 'script', srcUrl: '/assets/app.js', position: 'head' } as ProcessedAsset;
		const second = { kind: 'stylesheet', srcUrl: '/assets/app.css', position: 'head' } as ProcessedAsset;

		expect(transformer.dedupeProcessedAssets([first, duplicate, second])).toEqual([first, second]);
	});
});
