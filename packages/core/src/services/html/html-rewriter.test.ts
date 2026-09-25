import { describe, expect, it } from 'vitest';
import {
	HtmlRewriter,
	rewriteFirstElement,
	type HtmlRewriterElement,
	type HtmlRewriterElementHandlers,
} from './html-rewriter.ts';

/**
 * Expected outputs are what Bun 1.3.8's native `HTMLRewriter` (lol-html) produces
 * for the same input and handlers, so these cases are the parity contract.
 */
const mark = (tag: string): HtmlRewriterElementHandlers => ({
	element(element) {
		element.before(`[B:${tag}]`, { html: true });
		element.prepend(`[P:${tag}]`, { html: true });
		element.append(`[A:${tag}]`, { html: true });
		element.after(`[F:${tag}]`, { html: true });
	},
});

function rewrite(html: string, ...tags: string[]): string {
	const rewriter = new HtmlRewriter();
	for (const tag of tags) rewriter.on(tag, mark(tag));
	return rewriter.transform(html);
}

function streamOf(chunks: Array<string | Uint8Array>): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
			controller.close();
		},
	});
}

describe('HtmlRewriter (lol-html parity)', () => {
	it('orders before/append in call order and prepend/after in reverse', () => {
		const output = new HtmlRewriter()
			.on('head', {
				element(element) {
					element.prepend('<p1>', { html: true }).prepend('<p2>', { html: true });
					element.append('<a1>', { html: true }).append('<a2>', { html: true });
					element.before('<b1>', { html: true }).before('<b2>', { html: true });
					element.after('<f1>', { html: true }).after('<f2>', { html: true });
				},
			})
			.transform('<html><head><title>T</title></head><body><main>M</main></body></html>');

		expect(output).toBe(
			'<html><b1><b2><head><p2><p1><title>T</title><a1><a2></head><f2><f1><body><main>M</main></body></html>',
		);
	});

	it('escapes text content unless html is requested', () => {
		const output = new HtmlRewriter()
			.on('body', { element: (element) => void element.append(`<x> & "q" 's'`) })
			.transform('<body></body>');

		expect(output).toBe(`<body>&lt;x&gt; &amp; "q" 's'</body>`);
	});

	it('drops append and after content for elements that never close', () => {
		expect(rewrite('<html><head><title>T</title><body><main>M</main>', 'head', 'body')).toBe(
			'<html>[B:head]<head>[P:head]<title>T</title>[B:body]<body>[P:body]<main>M</main>',
		);
	});

	it('leaves documents without the element untouched', () => {
		expect(rewrite('<html><body><main>M</main></body></html>', 'head')).toBe(
			'<html><body><main>M</main></body></html>',
		);
	});

	it('ignores tags inside script, comments and textarea', () => {
		const html =
			'<html><head><script>const s = "</head><body>";</script></head><body><!-- <body> --><textarea></body></textarea><main>M</main></body></html>';

		expect(rewrite(html, 'head', 'body')).toBe(
			'<html>[B:head]<head>[P:head]<script>const s = "</head><body>";</script>[A:head]</head>[F:head][B:body]<body>[P:body]<!-- <body> --><textarea></body></textarea><main>M</main>[A:body]</body>[F:body]</html>',
		);
	});

	it('ignores end tags inside title, noscript, style, iframe and xmp', () => {
		expect(rewrite('<head><title></head>fake</title><noscript></head></noscript></head>', 'head')).toBe(
			'[B:head]<head>[P:head]<title></head>fake</title><noscript></head></noscript>[A:head]</head>[F:head]',
		);
		expect(
			rewrite(
				'<body><style>a{content:"</body>"}</style><iframe></body></iframe><xmp></body></xmp></body>',
				'body',
			),
		).toBe(
			'[B:body]<body>[P:body]<style>a{content:"</body>"}</style><iframe></body></iframe><xmp></body></xmp>[A:body]</body>[F:body]',
		);
	});

	it('follows script escape states and case-insensitive end tags', () => {
		expect(rewrite('<body><script><!--<script>x</script>--></script></body>', 'body')).toBe(
			'[B:body]<body>[P:body]<script><!--<script>x</script>--></script>[A:body]</body>[F:body]',
		);
		expect(rewrite('<head><SCRIPT>x="</head>"</SCRIPT ></head >', 'head')).toBe(
			'[B:head]<head>[P:head]<SCRIPT>x="</head>"</SCRIPT >[A:head]</head >[F:head]',
		);
	});

	it('treats <!--> and <!---> as complete comments', () => {
		expect(rewrite('<body><!--><head><!---></body>', 'head', 'body')).toBe(
			'[B:body]<body>[P:body]<!-->[B:head]<head>[P:head]<!--->[A:body]</body>[F:body]',
		);
	});

	it('closes nested elements of the same name at the matching end tag', () => {
		const output = new HtmlRewriter()
			.on('div', {
				element: (element) => void element.append(`<!--end:${element.getAttribute('id')}-->`, { html: true }),
			})
			.transform('<div id="a"><div id="b">x</div></div><p>after</p>');

		expect(output).toBe('<div id="a"><div id="b">x<!--end:b--></div><!--end:a--></div><p>after</p>');
		expect(rewrite('<body><body>inner</body></body>', 'body')).toBe(
			'[B:body]<body>[P:body][B:body]<body>[P:body]inner[A:body]</body>[F:body][A:body]</body>[F:body]',
		);
	});

	it('emits before/after around void and self-closing foreign elements and ignores their content', () => {
		expect(rewrite('<head><meta charset="x"><link rel="x"></head>', 'meta')).toBe(
			'<head>[B:meta]<meta charset="x">[F:meta]<link rel="x"></head>',
		);
		expect(rewrite('<svg><path d="m0"/></svg><br/>', 'path', 'br')).toBe(
			'<svg>[B:path]<path d="m0"/>[F:path]</svg>[B:br]<br/>[F:br]',
		);
		expect(rewrite('<div/><p>x</p></div>', 'div')).toBe('[B:div]<div/>[P:div]<p>x</p>[A:div]</div>[F:div]');
	});

	it('rewrites changed attributes and keeps untouched ones verbatim', () => {
		const output = new HtmlRewriter()
			.on('html', {
				element(element) {
					element.setAttribute('data-owner', 'r"x').setAttribute('lang', 'it').removeAttribute('hidden');
				},
			})
			.on('body', { element: (element) => void element.setAttribute('data-y', '') })
			.transform(`<html LANG=en data-x='1' hidden><body class="a b"></body></html>`);

		expect(output).toBe(
			`<html LANG="it" data-x='1' data-owner="r&quot;x"><body class="a b" data-y=""></body></html>`,
		);
		expect(
			new HtmlRewriter()
				.on('html', { element: (element) => void element.setAttribute('a', `x&y<z>"q'`) })
				.transform('<html>'),
		).toBe(`<html a="x&y<z>&quot;q'">`);
	});

	it('matches tags case-insensitively and reads attributes', () => {
		expect(rewrite('<HTML><HEAD></HEAD><BODY></BODY></HTML>', 'head', 'body')).toBe(
			'<HTML>[B:head]<HEAD>[P:head][A:head]</HEAD>[F:head][B:body]<BODY>[P:body][A:body]</BODY>[F:body]</HTML>',
		);

		const seen: string[] = [];
		new HtmlRewriter()
			.on('body', {
				element(element) {
					seen.push(
						element.tagName,
						[...element.attributes].map(([name, value]) => `${name}=${value}`).join(','),
					);
					seen.push(String(element.hasAttribute('DATA-A')), String(element.getAttribute('missing')));
				},
			})
			.transform('<Body data-a="1" data-x=a>b></Body>');
		expect(seen).toEqual(['body', 'data-a=1,data-x=a', 'true', 'null']);
	});

	it('passes doctypes, processing instructions and quoted > through untouched', () => {
		expect(rewrite('<!DOCTYPE html><?xml x?><html><head></head></html>', 'head')).toBe(
			'<!DOCTYPE html><?xml x?><html>[B:head]<head>[P:head][A:head]</head>[F:head]</html>',
		);
		expect(rewrite('<body data-x="a>b" data-y=a/b><p>x</p></body>', 'body')).toBe(
			'[B:body]<body data-x="a>b" data-y=a/b>[P:body]<p>x</p>[A:body]</body>[F:body]',
		);
	});

	it('matches elements inside template content', () => {
		expect(rewrite('<template><body></body></template>', 'body')).toBe(
			'<template>[B:body]<body>[P:body][A:body]</body>[F:body]</template>',
		);
	});

	it('drops mutations of elements implicitly closed by an ancestor end tag', () => {
		expect(rewrite('<head><p>x<path d="1"/></head><div></p></div>', 'head', 'p', 'path')).toBe(
			'[B:head]<head>[P:head][B:p]<p>[P:p]x[B:path]<path d="1"/>[P:path][A:head]</head>[F:head]<div></p></div>',
		);
	});

	it('recognises CDATA sections only in foreign content', () => {
		expect(rewrite('<body><svg><![CDATA[ a > </body> ]]></svg><p>x</p></body>', 'body')).toBe(
			'[B:body]<body>[P:body]<svg><![CDATA[ a > </body> ]]></svg><p>x</p>[A:body]</body>[F:body]',
		);
		expect(rewrite('<body><![CDATA[ a > </body> ]]><p>x</p></body>', 'body')).toBe(
			'[B:body]<body>[P:body]<![CDATA[ a > [A:body]</body>[F:body] ]]><p>x</p></body>',
		);
		expect(
			rewrite('<body><svg><foreignObject><![CDATA[ a > </body> ]]></foreignObject></svg></body>', 'body'),
		).toBe(
			'[B:body]<body>[P:body]<svg><foreignObject><![CDATA[ a > [A:body]</body>[F:body] ]]></foreignObject></svg></body>',
		);
	});

	it('follows HTML integration points and break-out tags in foreign content', () => {
		expect(rewrite('<body><svg><foreignObject><style>a</body>b</style></foreignObject></svg></body>', 'body')).toBe(
			'[B:body]<body>[P:body]<svg><foreignObject><style>a</body>b</style></foreignObject></svg>[A:body]</body>[F:body]',
		);
		expect(rewrite('<body><svg><style>a</body>b</style></svg></body>', 'body')).toBe(
			'[B:body]<body>[P:body]<svg><style>a[A:body]</body>[F:body]b</style></svg></body>',
		);
		expect(rewrite('<body><svg><p><style>a</body>b</style></p></svg></body>', 'body')).toBe(
			'[B:body]<body>[P:body]<svg><p><style>a</body>b</style></p></svg>[A:body]</body>[F:body]',
		);
		expect(rewrite('<body><svg><font><style>a</body>b</style></font></svg></body>', 'body')).toBe(
			'[B:body]<body>[P:body]<svg><font><style>a[A:body]</body>[F:body]b</style></font></svg></body>',
		);
		expect(rewrite('<body><svg><font color="r"><style>a</body>b</style></font></svg></body>', 'body')).toBe(
			'[B:body]<body>[P:body]<svg><font color="r"><style>a</body>b</style></font></svg>[A:body]</body>[F:body]',
		);
	});

	it('closes comments with --!> and end tags after quoted attribute values', () => {
		expect(rewrite('<body><!--a--!><p>x</p></body>', 'body')).toBe(
			'[B:body]<body>[P:body]<!--a--!><p>x</p>[A:body]</body>[F:body]',
		);
		expect(rewrite('<body></body foo="</body>">t</body>', 'body')).toBe(
			'[B:body]<body>[P:body][A:body]</body foo="</body>">[F:body]t</body>',
		);
	});

	it('re-serialises a changed start tag like lol-html', () => {
		const setZ = (html: string, tag: string, extra?: (element: HtmlRewriterElement) => void) =>
			new HtmlRewriter()
				.on(tag, {
					element(element) {
						element.setAttribute('z', '9');
						extra?.(element);
					},
				})
				.transform(html);

		expect(setZ('<div\n  a="1"\n  b=\'2\'\n  c\n>', 'div')).toBe(`<div a="1" b='2' c z="9">`);
		expect(setZ('<div a="1"   b=2\t/>', 'div')).toBe('<div a="1" b=2 z="9" />');
		expect(setZ('<div a="1"/>', 'div', (element) => element.prepend('[P]', { html: true }))).toBe(
			'<div a="1" z="9">[P]',
		);
		expect(setZ('<div a=/>', 'div')).toBe('<div a=/ z="9">');
		expect(setZ('<br a="1"/>', 'br', (element) => element.prepend('[P]', { html: true }))).toBe(
			'<br a="1" z="9" />',
		);
		expect(
			new HtmlRewriter()
				.on('div', { element: (element) => void element.removeAttribute('a') })
				.transform('<div a="1"/>'),
		).toBe('<div/>');
	});

	it('rejects selectors it cannot match', () => {
		expect(() => new HtmlRewriter().on('body > main', {})).toThrow(/tag-name and "\*" selectors only/);
	});
});

describe('rewriteFirstElement', () => {
	it('rewrites only the first matching start tag and passes the rest through verbatim', () => {
		const output = rewriteFirstElement(
			'<!-- <div> --><script>"<div>"</script><div a="x>y">1<div>2</div></div><p',
			(element) => element.tagName === 'div',
			(element) => void element.setAttribute('b', '2'),
		);

		expect(output).toBe('<!-- <div> --><script>"<div>"</script><div a="x>y" b="2">1<div>2</div></div><p');
	});

	it('with leadingOnly, rewrites nothing when text or a comment precedes the target', () => {
		const stamp = (html: string) =>
			rewriteFirstElement(
				html,
				() => true,
				(element) => void element.setAttribute('b', '2'),
				{ leadingOnly: true },
			);

		expect(stamp('  <div>x</div>')).toBe('  <div b="2">x</div>');
		expect(stamp('<!--c--><div>x</div>')).toBe('<!--c--><div>x</div>');
		expect(stamp('t<div>x</div>')).toBe('t<div>x</div>');
	});

	it('returns the input unchanged when nothing matches', () => {
		const html = '<main><p>x</p></main>';
		expect(
			rewriteFirstElement(
				html,
				(element) => element.tagName === 'div',
				() => {},
			),
		).toBe(html);
	});
});

describe('HtmlRewriter streaming', () => {
	it('rewrites a Response whose tags and attributes span chunk boundaries', async () => {
		const response = new Response(
			streamOf([
				'<html><he',
				'ad><ti',
				'tle>T</title></he',
				'ad><bo',
				'dy class="a',
				'>b"><main>M</main></bo',
				'dy></html>',
			]),
			{ status: 201, headers: { 'Content-Type': 'text/html', 'Content-Length': '999' } },
		);

		const result = new HtmlRewriter().on('head', mark('head')).on('body', mark('body')).transform(response);

		expect(result.status).toBe(201);
		expect(result.headers.get('content-length')).toBeNull();
		expect(await result.text()).toBe(
			'<html>[B:head]<head>[P:head]<title>T</title>[A:head]</head>[F:head][B:body]<body class="a>b">[P:body]<main>M</main>[A:body]</body>[F:body]</html>',
		);
	});

	it('keeps raw-text, comment and escape-state decisions across chunks', async () => {
		const chunks = [
			'<body><scr',
			'ipt>a="<!',
			'--<scri',
			'pt></scr',
			'ipt>--></sc',
			'ript><!-',
			'- </body> --',
			'><main>é',
			'</main></bo',
			'dy>',
		];
		const html = chunks.join('');
		const result = new HtmlRewriter().on('body', mark('body')).transform(new Response(streamOf(chunks)));

		expect(await result.text()).toBe(rewrite(html, 'body'));
		expect(rewrite(html, 'body')).toContain('<main>é</main>[A:body]</body>[F:body]');
	});

	it('decodes multi-byte characters split across chunks', async () => {
		const bytes = new TextEncoder().encode('<body>è</body>');
		const result = new HtmlRewriter()
			.on('body', mark('body'))
			.transform(new Response(streamOf([bytes.slice(0, 7), bytes.slice(7)])));

		expect(await result.text()).toBe('[B:body]<body>[P:body]è[A:body]</body>[F:body]');
	});
});
