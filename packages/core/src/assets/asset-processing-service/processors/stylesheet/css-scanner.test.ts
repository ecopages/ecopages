import { createPath } from '@ecopages/file-system/path';
import { describe, expect, it } from 'vitest';
import {
	isExternalReference,
	listCssReferences,
	scanCss,
	splitReference,
	tokenizeCss,
	wrapInConditions,
} from './css-scanner.ts';

/** Rewrites every file reference to `<name>` so a test sees which ones the scan offered. */
const mark = (reference: string) => `<${reference}>`;

describe('scanCss', () => {
	it('leaves url() inside strings and comments alone and reads escaped urls', () => {
		const css = [
			'.a::before { content: "url(./nope.png)"; }',
			'.b::before { content: "a\\"b url(x.png)"; }',
			'.c::before { content: "/*"; }',
			'/* url(commented.png) */',
			'.d { background: url(i\\).svg); }',
		].join('\n');

		expect(scanCss(css, { reference: mark })).toBe(css.replace('url(i\\).svg)', 'url("<i).svg>")'));
	});

	it('offers the string references of image-set() as well as its url()', () => {
		expect(scanCss('.a { background: image-set("./i.svg" 1x, url(i.svg) 2x); }', { reference: mark })).toBe(
			'.a { background: image-set("<./i.svg>" 1x, url("<i.svg>") 2x); }',
		);
	});

	it('skips a url() holding another function without offering it', () => {
		const css = '.a { background: url(var(--hero)) , url( var(--other, "x.png") ); }';

		expect(scanCss(css, { reference: mark })).toBe(css);
	});

	it('never offers a fragment, a root-relative path or a URL with a scheme', () => {
		const css =
			'.a { background: url(#frag), url(/img/a.png), url(data:image/png;base64,AA==), url(https://x/a.png); }';

		expect(scanCss(css, { reference: mark })).toBe(css);
	});

	it('hands a top-level @import to its handler and leaves it when the handler returns undefined', () => {
		const seen: unknown[] = [];
		const css = "@import url(a.css) layer(x) screen;\n@import 'b.css';\n.a { color: red; }";

		expect(
			scanCss(css, {
				import: (statement) => {
					seen.push(statement);
					return undefined;
				},
			}),
		).toBe(css);
		expect(seen).toEqual([
			{ statement: '@import url(a.css) layer(x) screen;', specifier: 'a.css', conditions: 'layer(x) screen' },
			{ statement: "@import 'b.css';", specifier: 'b.css', conditions: '' },
		]);
	});

	it('replaces an @import and reads a final one without a semicolon', () => {
		expect(scanCss(".top {}\n@import './last.css'", { import: (statement) => `/*${statement.specifier}*/` })).toBe(
			'.top {}\n/*./last.css*/',
		);
	});

	it('ignores an @import inside a block, a comment or a string', () => {
		const css = '@media print { @import "x.css"; }\n/* @import "y.css"; */\n.a { content: "@import z.css;"; }';

		expect(scanCss(css, { import: () => '' })).toBe(css);
	});

	it('replaces the @charset through its handler', () => {
		expect(scanCss('@charset "utf-8";\n.a {}', { charset: () => '' })).toBe('\n.a {}');
		expect(scanCss('@charset "utf-8";\n.a {}', {})).toBe('@charset "utf-8";\n.a {}');
	});
});

describe('listCssReferences', () => {
	it('lists the relative references once and every @import', () => {
		const css = [
			"@import 'base.css';",
			'@import url("https://cdn.example/font.css");',
			'.a { background: url(a.png), url(a.png), url(/root.png); }',
			'.b { background: image-set("b.png" 1x); }',
		].join('\n');

		const { references, imports } = listCssReferences(css);

		expect(references).toEqual(['a.png', 'b.png']);
		expect(imports.map((statement) => statement.specifier)).toEqual(['base.css', 'https://cdn.example/font.css']);
	});
});

describe('listCssReferences for a page', () => {
	it('lists url() and image-set() strings in document order, skipping comments and other URLs', () => {
		const css =
			'/* url(old.png) */ a { background: image-set(\'a.png\' 1x, url(b.png) 2x, "/c.png" 3x); mask: url("data:x") url(d.svg#m); }';

		expect(listCssReferences(css).references).toEqual(['a.png', 'b.png', 'd.svg#m']);
	});

	it('reads the declarations of a style attribute', () => {
		expect(listCssReferences("background: url('bg.png'); color: red").references).toEqual(['bg.png']);
	});
});

describe('wrapInConditions', () => {
	it('wraps the contents in the layer, supports and media blocks the conditions stand for', () => {
		expect(wrapInConditions('.part {}', 'layer(lib) supports(display: grid) screen and (min-width: 1px)')).toBe(
			[
				'@layer lib {',
				'@supports (display: grid) {',
				'@media screen and (min-width: 1px) {',
				'.part {}',
				'}',
				'}',
				'}',
			].join('\n'),
		);
		expect(wrapInConditions('.print {}', 'layer print')).toBe('@layer {\n@media print {\n.print {}\n}\n}');
	});

	it('returns undefined for conditions it cannot read', () => {
		expect(wrapInConditions('.a {}', 'screen { }')).toBeUndefined();
	});
});

describe('on Windows paths', () => {
	const win32 = createPath('win32');

	it('reads a drive path as a file, not a URL with a scheme', () => {
		expect(isExternalReference('D:\\lib\\a.png')).toBe(false);
		expect(isExternalReference('d:/lib/a.png')).toBe(false);
		expect(isExternalReference('https://cdn.example/a.png')).toBe(true);
		expect(isExternalReference('data:image/png;base64,AA==')).toBe(true);
	});

	it('offers the absolute path a rebase writes for a file on another drive', () => {
		const other = win32.relative('C:\\app\\src\\styles', 'D:\\lib\\img\\a.png');

		expect(other).toBe('D:/lib/img/a.png');
		expect(scanCss(`.a { background: url("${other}"); }`, { reference: mark })).toBe(
			'.a { background: url("<D:/lib/img/a.png>"); }',
		);
	});

	it('splits a drive path like any other reference', () => {
		expect(splitReference('D:\\lib\\a.png?v=1#x')).toEqual({
			filePart: 'D:\\lib\\a.png',
			decoded: 'D:\\lib\\a.png',
			suffix: '?v=1#x',
		});
	});
});

describe('tokenizeCss', () => {
	const typed = (css: string) =>
		tokenizeCss(css).map(({ type, start, end }) => [type, css.slice(start, end)] as const);

	it('covers the source without gaps', () => {
		const css = '.a { content: "x;{"; /* } */ background: url(a;b.png) } \\{ b:hover { }';

		expect(
			tokenizeCss(css)
				.map(({ start, end }) => css.slice(start, end))
				.join(''),
		).toBe(css);
	});

	it('reads strings, comments, escapes and urls as single tokens', () => {
		expect(typed('a{b:"}";/*;*/c:url(x;y)}\\;')).toEqual([
			['word', 'a'],
			['punct', '{'],
			['word', 'b'],
			['punct', ':'],
			['string', '"}"'],
			['punct', ';'],
			['comment', '/*;*/'],
			['word', 'c'],
			['punct', ':'],
			['url', 'url(x;y)'],
			['punct', '}'],
			['escape', '\\;'],
		]);
	});

	it('keeps a function name and its parenthesis apart, and a url holding a function as a function', () => {
		expect(typed('calc(1px) url(var(--x))')).toEqual([
			['word', 'calc'],
			['punct', '('],
			['word', '1px'],
			['punct', ')'],
			['space', ' '],
			['word', 'url'],
			['punct', '('],
			['word', 'var'],
			['punct', '('],
			['word', '--x'],
			['punct', ')'],
			['punct', ')'],
		]);
	});
});
