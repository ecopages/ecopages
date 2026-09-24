import { describe, expect, it } from 'vitest';
import type { ProcessedAsset } from '../assets/asset-processing-service/index.js';
import { HtmlTransformerService } from './html-transformer.service.ts';

type InjectionScenario = {
	label: string;
	html: string;
	dependencies: ProcessedAsset[];
	expected: string;
};

const INJECTION_SCENARIOS: InjectionScenario[] = [
	{
		label: 'places head and body dependencies before the closing tags',
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
		expected:
			'<html><head><title>Matrix</title><link rel="stylesheet" href="/matrix.css" media="screen"><script id="matrix-inline">window.matrix = true;</script></head><body><main>Page content</main><script src="/matrix-body.js" defer="true"></script></body></html>',
	},
	{
		label: 'skips scripts excluded from html',
		html: '<html><head></head><body><section>Visible</section></body></html>',
		dependencies: [
			{ kind: 'script', inline: false, position: 'body', srcUrl: '/excluded.js', excludeFromHtml: true },
			{ kind: 'script', inline: false, position: 'body', srcUrl: '/included.js' },
		],
		expected:
			'<html><head></head><body><section>Visible</section><script src="/included.js"></script></body></html>',
	},
	{
		label: 'defaults scripts to the body and keeps stylesheets in the head',
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
			{ kind: 'script', inline: true, content: 'const x = 1;', srcUrl: '/inline.js' } as ProcessedAsset,
		],
		expected:
			'<html><head><style data-test="inline-style">.nested{color:red;}</style></head><body><div><span>Nested</span></div><script>const x = 1;</script></body></html>',
	},
	{
		label: 'ignores head and body tags inside scripts and comments',
		html: '<html><head><script>document.write("</head><body>")</script></head><body><!-- </body> --><main>M</main></body></html>',
		dependencies: [
			{ kind: 'stylesheet', inline: false, position: 'head', srcUrl: '/a.css' },
			{ kind: 'script', inline: false, position: 'body', srcUrl: '/b.js' },
		],
		expected:
			'<html><head><script>document.write("</head><body>")</script><link rel="stylesheet" href="/a.css"></head><body><!-- </body> --><main>M</main><script src="/b.js"></script></body></html>',
	},
];

describe('HtmlTransformerService', () => {
	it.each(INJECTION_SCENARIOS)('$label', ({ html, dependencies, expected }) => {
		const transformer = new HtmlTransformerService();
		transformer.setProcessedDependencies(dependencies);

		expect(transformer.transformHtml(html)).toBe(expected);
	});

	it('injects html contributions into explicit document slots in array order', () => {
		const transformer = new HtmlTransformerService();

		const html = transformer.transformHtml(
			'<html><head><title>Base</title></head><body><main>Page</main></body></html>',
			[
				{ placement: 'head-prepend', html: '<meta name="first">' },
				{ placement: 'head-prepend', html: '<meta name="second">' },
				{ placement: 'head-append', html: '<script>window.headAppend = true;</script>' },
				{ placement: 'body-prepend', html: '<div id="body-prepend"></div>' },
				{ placement: 'body-append', html: '<div id="body-append"></div>' },
			],
		);

		expect(html).toBe(
			'<html><head><meta name="first"><meta name="second"><title>Base</title><script>window.headAppend = true;</script></head><body><div id="body-prepend"></div><main>Page</main><div id="body-append"></div></body></html>',
		);
	});

	it('streams response bodies through the rewriter', async () => {
		const transformer = new HtmlTransformerService();
		transformer.setProcessedDependencies([{ kind: 'script', inline: false, position: 'body', srcUrl: '/app.js' }]);
		const encoder = new TextEncoder();
		const response = new Response(
			new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode('<html><head></head><bo'));
					controller.enqueue(encoder.encode('dy><main>Streaming</main></bo'));
					controller.enqueue(encoder.encode('dy></html>'));
					controller.close();
				},
			}),
			{ status: 203, headers: { 'Content-Type': 'text/html' } },
		);

		const result = transformer.transform(response);

		expect(result.status).toBe(203);
		expect(result.body).toBeInstanceOf(ReadableStream);
		expect(await result.text()).toBe(
			'<html><head></head><body><main>Streaming</main><script src="/app.js"></script></body></html>',
		);
	});

	it('skips head injection when the document has no head element', () => {
		const transformer = new HtmlTransformerService();
		transformer.setProcessedDependencies([
			{ kind: 'stylesheet', inline: false, position: 'head', srcUrl: '/a.css' },
			{ kind: 'script', inline: false, position: 'body', srcUrl: '/b.js' },
		]);

		expect(transformer.transformHtml('<body><main>M</main></body>')).toBe(
			'<body><main>M</main><script src="/b.js"></script></body>',
		);
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

	it('should preserve assets with different package roles during dedupe', () => {
		const transformer = new HtmlTransformerService();
		const pageScript = {
			kind: 'script',
			srcUrl: '/assets/app.js',
			position: 'head',
			packageRole: 'page-script',
		} as ProcessedAsset;
		const runtimeScript = {
			kind: 'script',
			srcUrl: '/assets/app.js',
			position: 'head',
			packageRole: 'runtime',
		} as ProcessedAsset;

		expect(transformer.dedupeProcessedAssets([pageScript, runtimeScript])).toEqual([pageScript, runtimeScript]);
	});

	it('should prefer page package html assets during transform', () => {
		const transformer = new HtmlTransformerService();
		transformer.setProcessedDependencies([
			{
				kind: 'script',
				srcUrl: '/ignored.js',
				position: 'body',
			},
		]);
		transformer.setPagePackage({
			assets: [
				{
					kind: 'script',
					srcUrl: '/ignored.js',
					position: 'body',
				},
			],
			htmlAssets: [
				{
					kind: 'script',
					srcUrl: '/chosen.js',
					position: 'body',
				},
			],
			inlineAssets: [],
			separateAssets: [],
			dynamicChunks: [],
		});

		const html = transformer.transformHtml('<html><head></head><body></body></html>');

		expect(html).toContain('<script src="/chosen.js"></script>');
		expect(html).not.toContain('/ignored.js');
	});

	it('injects page browser entry assets while keeping chunk assets out of initial html', () => {
		const transformer = new HtmlTransformerService();
		const routeStylesheet = {
			kind: 'stylesheet',
			srcUrl: '/route.css',
			position: 'head',
		} as ProcessedAsset;
		const entryScript = {
			kind: 'script',
			srcUrl: '/page-entry.js',
			position: 'head',
			packageRole: 'page-script',
		} as ProcessedAsset;
		const chunkScript = {
			kind: 'script',
			srcUrl: '/page-chunk.js',
			position: 'body',
			packageRole: 'dynamic-chunk',
		} as ProcessedAsset;

		transformer.setPagePackage({
			assets: [routeStylesheet, entryScript, chunkScript],
			pageBrowserGraph: {
				entryAssets: [entryScript],
				chunkAssets: [chunkScript],
			},
			htmlAssets: [routeStylesheet, entryScript, chunkScript],
			pageScript: entryScript,
			inlineAssets: [],
			separateAssets: [],
			dynamicChunks: [chunkScript],
		});

		const html = transformer.transformHtml('<html><head></head><body></body></html>');

		expect(transformer.getProcessedDependencies()).toEqual([routeStylesheet, entryScript]);
		expect(html).toContain('<link rel="stylesheet" href="/route.css">');
		expect(html).toContain('<script src="/page-entry.js"></script>');
		expect(html).not.toContain('/page-chunk.js');
	});
});
