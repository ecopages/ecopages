import { describe, expect, it } from 'vitest';
import { HtmlRewriter, type HtmlRewriterElement, type HtmlRewriterElementHandlers } from './html-rewriter.ts';

/**
 * Differential check against Bun's native `HTMLRewriter` (lol-html). Runs only in
 * the `bun-adapter` Vitest project, i.e. when Vitest itself runs on Bun.
 */
const CORPUS = [
	'<html><head><title>T</title></head><body><main>M</main></body></html>',
	'<html><head><title>T</title><body><main>M</main>',
	'<html><head><script>const s = "</head><body>";</script></head><body><!-- <body> --><textarea></body></textarea><main>M</main></body></html>',
	'<head><title></head>fake</title><noscript></head></noscript></head>',
	'<body><style>a{content:"</body>"}</style><iframe></body></iframe><xmp></body></xmp></body>',
	'<body><script><!--<script>x</script>--></script></body>',
	'<head><SCRIPT>x="</head>"</SCRIPT ></head >',
	'<body><!--><head><!---></body>',
	'<div id="a"><div id="b">x</div></div><body><body>inner</body></body>',
	'<head><meta charset="x"><link rel="x"></head><svg><path d="m0"/></svg><br/><div/><p>x</p></div>',
	`<html LANG=en data-x='1' hidden><body class="a b" data-y="a>b"></body></html>`,
	'<!DOCTYPE html><?xml x?><HTML><HEAD></HEAD><BODY></BODY></HTML>',
	'<template><body></body></template>',
	'<body\n class="x"\n>y</body\n>',
	'<body><svg><![CDATA[ a > </body> ]]></svg><![CDATA[ b > </body> ]]></body>',
	'<body><svg><foreignObject><style>a</body>b</style></foreignObject><p><style>c</body>d</style></p></svg></body>',
	'<body><svg><font color="r"><style>a</body>b</style></font></svg><math><mi><style>c</body></style></mi></math></body>',
	'<body><!--a--!></body foo="</body>"><div a=/><div a="x"/ b="y"><br/></body>',
];

const TAGS = ['html', 'head', 'body', 'main', 'div', 'meta', 'link', 'path', 'br', 'script'];

function handlers(tag: string): HtmlRewriterElementHandlers {
	return {
		element(element) {
			element.before(`[B:${tag}]`, { html: true });
			element.prepend(`[P:${tag}]`, { html: true });
			element.append(`[A:${tag}]`, { html: true });
			element.after(`<F:${tag}>`);
			if (tag === 'html') element.setAttribute('data-eco', 'x"y');
		},
	};
}

const SERIALIZE_CORPUS = [
	'<div a="1"/>',
	'<div\n  a="1"\n  b=\'2\'\n  c\n>',
	'<DIV A="1" b = 2/>',
	'<div a=/>',
	'<div a="x"/ b="y">',
	'<br a="1"/>',
	'<svg><path d="1" /></svg>',
];

const MUTATIONS: Array<(element: HtmlRewriterElement) => void> = [
	(element) => element.setAttribute('z', 'v"w'),
	(element) => element.setAttribute('a', '2').prepend('[P]', { html: true }),
	(element) => element.removeAttribute('a'),
];

describe('HtmlRewriter parity with Bun HTMLRewriter', () => {
	it.each(CORPUS)('matches native output for %s', (html) => {
		let native = new HTMLRewriter();
		const ours = new HtmlRewriter();
		for (const tag of TAGS) {
			native = native.on(tag, handlers(tag) as HTMLRewriterTypes.HTMLRewriterElementContentHandlers);
			ours.on(tag, handlers(tag));
		}

		expect(ours.transform(html)).toBe(native.transform(html));
	});

	it.each(SERIALIZE_CORPUS)('re-serialises changed tags like native for %s', (html) => {
		for (const mutate of MUTATIONS) {
			const tag = html.includes('<path') ? 'path' : html.toLowerCase().includes('<br') ? 'br' : 'div';
			const native = new HTMLRewriter().on(tag, {
				element: mutate,
			} as HTMLRewriterTypes.HTMLRewriterElementContentHandlers);
			const ours = new HtmlRewriter().on(tag, { element: mutate });

			expect(ours.transform(html)).toBe(native.transform(html));
		}
	});
});
