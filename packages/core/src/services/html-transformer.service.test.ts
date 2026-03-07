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
});
