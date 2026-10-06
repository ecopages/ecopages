import { describe, expect, it, vi } from 'vitest';
import {
	compileHtmlPage,
	compileHtmlShell,
	getHtmlTemplateWatchFiles,
	type HtmlPageTemplate,
	type HtmlTemplatePart,
} from './html-page-template.ts';

const srcDir = '/app/src';
const pageFile = '/app/src/pages/about.html';
const options = { srcDir };

/** Renders parts with `[asset N]` and `[children]` placeholders. */
function show(parts: readonly HtmlTemplatePart[]): string {
	return parts
		.map((part) => (typeof part === 'string' ? part : 'slot' in part ? '[children]' : `[asset ${part.asset}]`))
		.join('');
}

function showHead(template: HtmlPageTemplate): Array<{ html: string; key?: string }> {
	return template.head.map((node) => ({ html: show(node.parts), ...(node.key ? { key: node.key } : {}) }));
}

describe('compileHtmlPage', () => {
	it('treats a fragment as body markup with no head tags', () => {
		const template = compileHtmlPage(pageFile, '\n<main><h1>Hi</h1></main>\n', options);

		expect(show(template.body)).toBe('<main><h1>Hi</h1></main>');
		expect(template.head).toEqual([]);
		expect(template.htmlAttributes).toEqual({});
	});

	it('splits a head followed by body markup', () => {
		const template = compileHtmlPage(
			pageFile,
			'<head>\n<title>About us</title>\n<meta name="description" content="Who we are.">\n<link rel="canonical" href="https://example.com/about">\n</head>\n<main>About</main>',
			options,
		);

		expect(showHead(template)).toEqual([
			{ html: '<title>About us</title>', key: 'title' },
			{ html: '<meta name="description" content="Who we are.">', key: 'meta:description' },
			{ html: '<link rel="canonical" href="https://example.com/about">', key: 'link:canonical' },
			{ html: '<meta property="og:title" content="About us">', key: 'meta:og:title' },
			{ html: '<meta property="og:description" content="Who we are.">', key: 'meta:og:description' },
			{ html: '<meta name="twitter:title" content="About us">', key: 'meta:twitter:title' },
			{ html: '<meta name="twitter:description" content="Who we are.">', key: 'meta:twitter:description' },
		]);
		expect(show(template.body)).toBe('<main>About</main>');
		expect(template.metadata).toEqual({
			title: 'About us',
			description: 'Who we are.',
			url: 'https://example.com/about',
		});
	});

	it('derives only the social tags a Page does not write, escaping their values', () => {
		const template = compileHtmlPage(
			pageFile,
			'<head><title>Q&amp;A "live"</title><meta property="og:title" content="Custom"></head><main>x</main>',
			options,
		);

		expect(showHead(template).filter((node) => node.key?.includes('title'))).toEqual([
			{ html: '<title>Q&amp;A "live"</title>', key: 'title' },
			{ html: '<meta property="og:title" content="Custom">', key: 'meta:og:title' },
			{ html: '<meta name="twitter:title" content="Q&amp;A &quot;live&quot;">', key: 'meta:twitter:title' },
		]);
		expect(showHead(template).some((node) => node.key === 'meta:og:description')).toBe(false);
	});

	it.each([
		{ written: '<meta property="twitter:title" content="Custom">', tag: 'twitter:title' },
		{ written: '<meta name="og:title" content="Custom">', tag: 'og:title' },
	])('derives no second $tag when the Page writes one with the other attribute', ({ written, tag }) => {
		const template = compileHtmlPage(
			pageFile,
			`<head><title>About</title>${written}</head><main>x</main>`,
			options,
		);

		expect(showHead(template).filter((node) => node.html.includes(`"${tag}"`))).toEqual([
			{ html: written, key: `meta:${tag}` },
		]);
	});

	it('reads a metadata tag whichever attribute holds its name', () => {
		const template = compileHtmlPage(
			pageFile,
			'<head><meta name="og:image" content="/cover.png"><meta property="description" content="Hi"></head><main>x</main>',
			options,
		);

		expect(template.metadata).toMatchObject({ image: '/cover.png', description: 'Hi' });
	});

	it('reads the leading head tags of a Page without a <head> element', () => {
		const template = compileHtmlPage(
			pageFile,
			'<!DOCTYPE html>\n<!-- page -->\n<title>About</title>\n<meta name="description" content="D">\n<main>x</main>',
			options,
		);

		expect(template.metadata).toEqual({ title: 'About', description: 'D' });
		expect(showHead(template).map((node) => node.key)).toEqual([
			'title',
			'meta:description',
			'meta:og:title',
			'meta:og:description',
			'meta:twitter:title',
			'meta:twitter:description',
		]);
		expect(show(template.body)).toContain('<main>x</main>');
		expect(show(template.body)).not.toMatch(/<title|<meta/);
	});

	it('emits a processed asset at the start of a Page without a <head> once, in the head', () => {
		const template = compileHtmlPage(pageFile, '<style>h1 { color: red; }</style><main>x</main>', options);

		expect(showHead(template).map((node) => node.html)).toEqual(['[asset 0]']);
		expect(show(template.body)).toBe('<main>x</main>');
	});

	it('reads the head tags of an <html> element without a <head>', () => {
		const template = compileHtmlPage(
			pageFile,
			'<html lang="en"><title>T</title><body class="b"><main>x</main></body></html>',
			options,
		);

		expect(template.metadata).toEqual({ title: 'T' });
		expect(template.htmlAttributes).toEqual({ lang: 'en' });
		expect(template.bodyAttributes).toEqual({ class: 'b' });
		expect(show(template.body)).toBe('<main>x</main>');
	});

	it('keeps a leading <noscript> in the body', () => {
		const template = compileHtmlPage(pageFile, '<noscript><p>Enable JS</p></noscript><main>x</main>', options);

		expect(template.head).toEqual([]);
		expect(show(template.body)).toBe('<noscript><p>Enable JS</p></noscript><main>x</main>');
	});

	it('leaves head tags after the first body content in the body', () => {
		const template = compileHtmlPage(
			pageFile,
			'<title>A</title><p>x</p><meta name="description" content="late">',
			options,
		);

		expect(template.metadata).toEqual({ title: 'A' });
		expect(show(template.body)).toBe('<p>x</p><meta name="description" content="late">');
	});

	it('strips the doctype and wrappers of a full document and keeps root attributes', () => {
		const template = compileHtmlPage(
			pageFile,
			'<!DOCTYPE html>\n<html lang="fr" class="marketing">\n<head><meta charset="UTF-8"></head>\n<body class="campaign">\n<main>Contenu</main>\n</body>\n</html>',
			options,
		);

		expect(show(template.body)).toBe('<main>Contenu</main>');
		expect(template.htmlAttributes).toEqual({ lang: 'fr', class: 'marketing' });
		expect(template.bodyAttributes).toEqual({ class: 'campaign' });
		expect(template.head).toEqual([{ parts: ['<meta charset="UTF-8">'], key: 'charset', charset: 'utf-8' }]);
	});

	it('reads keywords, image, and robots into page metadata', () => {
		const template = compileHtmlPage(
			pageFile,
			'<head><meta name="keywords" content="a, b,,c"><meta property="og:image" content="/og.png"><meta name="robots" content="noindex, nocache"></head>',
			options,
		);

		expect(template.metadata).toEqual({
			keywords: ['a', 'b', 'c'],
			image: '/og.png',
			robots: { index: false, follow: true, nocache: true },
		});
	});

	it('replaces local asset tags with slots and leaves the rest literal', () => {
		const warn = vi.fn();
		const template = compileHtmlPage(
			pageFile,
			[
				'<head><link rel="stylesheet" href="about.css" media="print"><style>main{}</style></head>',
				'<script type="module" src="./counter.ts"></script>',
				'<script src="../vendor/jquery.js"></script>',
				'<script src="https://cdn.example.com/x.js"></script>',
				'<link rel="stylesheet" href="/root.css">',
				'<script>inline()</script>',
				'<script type="text/template" src="./tpl.html"></script>',
			].join(''),
			{ ...options, warn },
		);

		expect(template.assets.map((asset) => asset.kind)).toEqual([
			'stylesheet',
			'inline-style',
			'module-script',
			'classic-script',
		]);
		expect(showHead(template)).toEqual([{ html: '[asset 0]' }, { html: '[asset 1]' }]);
		expect(show(template.body)).toBe(
			'[asset 2][asset 3]<script src="https://cdn.example.com/x.js"></script><link rel="stylesheet" href="/root.css"><script>inline()</script><script type="text/template" src="./tpl.html"></script>',
		);
		expect(getHtmlTemplateWatchFiles(template)).toEqual([
			'/app/src/pages/about.css',
			'/app/src/pages/counter.ts',
			'/app/src/vendor/jquery.js',
		]);

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]![0]).toContain('src="./tpl.html"');

		const stylesheet = template.assets[0]!;
		expect(stylesheet.kind === 'stylesheet' && stylesheet.tag.slice(stylesheet.urlStart, stylesheet.urlEnd)).toBe(
			'"about.css"',
		);
	});

	it('resolves local assets without their query or fragment and keeps root attribute values as written', () => {
		const template = compileHtmlPage(
			pageFile,
			'<html data-x="&copy; a&amp;b"><body><link rel="stylesheet" href="./about.css?v=1#x"></body></html>',
			options,
		);

		expect(template.assets[0]).toMatchObject({
			filepath: '/app/src/pages/about.css',
			reference: './about.css?v=1#x',
		});
		expect(template.htmlAttributes).toEqual({ 'data-x': '&copy; a&amp;b' });
	});

	it('warns about relative URLs on tags it leaves literal, but not about links', () => {
		const warn = vi.fn();
		compileHtmlPage(
			pageFile,
			'<img src="team.jpg"><img srcset="/a.jpg 1x, b.jpg 2x"><a href="contact">c</a><link rel="icon" href="favicon.ico">',
			{ ...options, warn },
		);

		expect(warn.mock.calls.map(([message]) => message.match(/relative (\w+)="([^"]*)"/)?.slice(1, 3))).toEqual([
			['src', 'team.jpg'],
			['srcset', '/a.jpg 1x, b.jpg 2x'],
			['href', 'favicon.ico'],
		]);
	});

	it('rejects a second <head>, an integrity attribute, and paths outside the source directory', () => {
		expect(() => compileHtmlPage(pageFile, '<head></head><head></head>', options)).toThrow(
			'only one <head> element',
		);
		expect(() => compileHtmlPage(pageFile, '<script src="./a.js" integrity="sha384-x"></script>', options)).toThrow(
			'integrity attribute',
		);
		expect(() => compileHtmlPage(pageFile, '<link rel="stylesheet" href="../../x.css">', options)).toThrow(
			'resolves outside the source directory',
		);
	});
});

describe('compileHtmlShell', () => {
	const shellFile = '/app/src/includes/html.html';

	it('drops the doctype and turns the marker into the children slot', () => {
		const template = compileHtmlShell(
			shellFile,
			'<!doctype html>\n<html><head><link rel="stylesheet" href="./site.css"></head><body><!-- eco:children --></body></html>',
			options,
		);

		expect(show(template.parts)).toBe('<html><head>[asset 0]</head><body>[children]</body></html>');
		expect(template.assets[0]).toMatchObject({ kind: 'stylesheet', filepath: '/app/src/includes/site.css' });
	});

	it('requires <html> with <head> and <body>, and exactly one marker', () => {
		expect(() => compileHtmlShell(shellFile, '<body><!-- eco:children --></body>', options)).toThrow(
			'<html> element with <head> and <body>',
		);
		expect(() => compileHtmlShell(shellFile, '<html><head></head><body></body></html>', options)).toThrow(
			'found 0',
		);
		expect(() =>
			compileHtmlShell(
				shellFile,
				'<html><head></head><body><!-- eco:children --><!--eco:children--></body></html>',
				options,
			),
		).toThrow('found 2');
	});
});
