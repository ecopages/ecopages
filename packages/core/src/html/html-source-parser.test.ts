import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities, findElements, getAttribute, getElementText, parseHtml } from './html-source-parser.ts';

describe('parseHtml', () => {
	it('reports element and attribute offsets into the source', () => {
		const source = '<p>x</p><link rel="stylesheet" href=\'./a.css\'>';
		const [link] = findElements(parseHtml(source), (element) => element.tagName === 'link');
		const href = getAttribute(link!, 'href')!;

		expect(source.slice(link!.start, link!.end)).toBe('<link rel="stylesheet" href=\'./a.css\'>');
		expect(source.slice(href.valueStart, href.valueEnd)).toBe("'./a.css'");
		expect(href.value).toBe('./a.css');
	});

	it('keeps raw text, comments, and quoted > out of the tree', () => {
		const source = '<script>if (a < b) "</div>";</script><!-- <head> --><div title="a>b">ok</div>';
		const nodes = parseHtml(source);

		expect(findElements(nodes, (element) => element.tagName === 'head')).toHaveLength(0);
		const [div] = findElements(nodes, (element) => element.tagName === 'div');
		expect(getElementText(source, div!)).toBe('ok');
		expect(getAttribute(div!, 'title')?.value).toBe('a>b');
	});

	it('closes an open head at the body start tag and nests nothing under self-closing syntax', () => {
		const source = '<head><title>t</title><body><svg><path d="M0"/><circle/></svg></body>';
		const nodes = parseHtml(source);
		const [head] = findElements(nodes, (element) => element.tagName === 'head');
		const [svg] = findElements(nodes, (element) => element.tagName === 'svg');

		expect(source.slice(head!.start, head!.end)).toBe('<head><title>t</title>');
		expect(svg!.children.map((node) => (node.type === 'element' ? node.tagName : node.type))).toEqual([
			'path',
			'circle',
		]);
	});

	it('closes an omitted </head> at the first element that cannot appear in a head', () => {
		const source = '<head><title>A</title><meta charset="utf-8"><main>Hi</main>';
		const nodes = parseHtml(source);
		const [head] = findElements(nodes, (element) => element.tagName === 'head');

		expect(head!.children.map((node) => (node.type === 'element' ? node.tagName : node.type))).toEqual([
			'title',
			'meta',
		]);
		expect(nodes.map((node) => (node.type === 'element' ? node.tagName : node.type))).toEqual(['head', 'main']);
	});

	it('ends an omitted </head> at non-whitespace text', () => {
		const source = '<head><title>X</title>\nWelcome\n<p>para</p>';
		const nodes = parseHtml(source);
		const [head] = findElements(nodes, (element) => element.tagName === 'head');

		expect(source.slice(head!.start, head!.end)).toBe('<head><title>X</title>\n');
		expect(
			nodes.map((node) => (node.type === 'element' ? node.tagName : source.slice(node.start, node.end))),
		).toEqual(['head', 'Welcome\n', 'p']);
	});

	it('closes inner elements at a mismatched end tag and ignores stray end tags', () => {
		const source = '<div><span>x</div><section></p><b>y</b></section>';
		const nodes = parseHtml(source);
		const [span] = findElements(nodes, (element) => element.tagName === 'span');
		const [section] = findElements(nodes, (element) => element.tagName === 'section');

		expect(source.slice(span!.start, span!.end)).toBe('<span>x');
		expect(nodes.map((node) => (node.type === 'element' ? node.tagName : node.type))).toEqual(['div', 'section']);
		expect(section!.children.map((node) => (node.type === 'element' ? node.tagName : node.type))).toEqual(['b']);
	});

	it('runs an unterminated script or comment to the end of the document', () => {
		const scriptSource = '<script>let a = "<p>';
		const nodes = parseHtml(scriptSource);
		const [script] = findElements(nodes, (element) => element.tagName === 'script');

		expect(script!.end).toBe(scriptSource.length);
		expect(script!.children).toEqual([{ type: 'text', start: '<script>'.length, end: scriptSource.length }]);
		expect(findElements(nodes, (element) => element.tagName === 'p')).toEqual([]);
		expect(parseHtml('<p>a</p><!-- open')[1]).toMatchObject({ type: 'comment', end: '<p>a</p><!-- open'.length });
	});

	it('lowercases tag and attribute names and reports unquoted and valueless attribute offsets', () => {
		const source = '<LINK REL=stylesheet HREF=a.css disabled>';
		const [link] = findElements(parseHtml(source), (element) => element.tagName === 'link');
		const href = getAttribute(link!, 'href')!;
		const disabled = getAttribute(link!, 'disabled')!;

		expect(source.slice(href.valueStart, href.valueEnd)).toBe('a.css');
		expect(disabled).toMatchObject({ value: '' });
		expect(disabled.valueStart).toBe(disabled.valueEnd);
	});

	it('closes elements left open at the end of the document', () => {
		const source = '<html><body><main>open';
		const [main] = findElements(parseHtml(source), (element) => element.tagName === 'main');

		expect(main!.end).toBe(source.length);
		expect(getElementText(source, main!)).toBe('open');
	});
});

describe('decodeHtmlEntities', () => {
	it('decodes numeric and common named references and leaves unknown ones', () => {
		expect(decodeHtmlEntities('Tom &amp; Jerry &#39;&#x41;&quot; &copy;')).toBe(`Tom & Jerry 'A" &copy;`);
	});
});
