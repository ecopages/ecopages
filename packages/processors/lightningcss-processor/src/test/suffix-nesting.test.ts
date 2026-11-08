import fs from 'node:fs';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import { path } from '@ecopages/file-system/path';
import { LightningCssProcessorPlugin, type LightningCssProcessorPluginConfig } from '../plugin.ts';
import { expandSuffixNesting, suffixNesting } from '../plugins/suffix-nesting.ts';
import { createTailwindApp, removeTailwindApps } from './tailwind-app.ts';

let rootDir: string;
const write = (relativePath: string, contents: string): string => {
	const file = path.join(rootDir, relativePath);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, contents);
	return file;
};

/** Transforms a stylesheet that is flattened for old browsers, so every rule prints as a plain selector. */
async function transform(file: string, options: LightningCssProcessorPluginConfig = {}, source?: string) {
	const plugin = new LightningCssProcessorPlugin({
		options: { plugins: [suffixNesting()], targets: ['chrome 90'], minify: true, ...options },
	});
	plugin.setContext(await finalizeEcoPagesConfig({ rootDir, srcDir: 'src', distDir: 'dist' }));
	return plugin.transformStylesheet(source ?? fs.readFileSync(file, 'utf8'), file);
}

/** Expands `css` and returns the rules as the flattened, minified output prints them. */
async function expanded(css: string, options: LightningCssProcessorPluginConfig = {}) {
	return (await transform(write('src/a.css', css), options)).css;
}

beforeEach(() => {
	rootDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lightningcss-suffix-')));
});

afterEach(() => {
	fs.rmSync(rootDir, { recursive: true, force: true });
	removeTailwindApps();
});

describe('suffixNesting()', () => {
	test('has a name and rewrites the source', () => {
		const plugin = suffixNesting();

		expect(plugin.name).toBe('suffix-nesting');
		expect(plugin.transformSource).toBeTypeOf('function');
	});

	test('expands a modifier of a class', async () => {
		const css = await expanded('.button { color: red; &--primary { color: blue; } }');

		expect(css).toBe('.button{color:red}.button--primary{color:#00f}');
	});

	test.each([
		['__element', '.card { &__title { margin: 0; } }', '.card__title{margin:0}'],
		['-suffix', '.menu { &-item { margin: 0; } }', '.menu-item{margin:0}'],
		['_suffix', '.menu { &_item { margin: 0; } }', '.menu_item{margin:0}'],
		['two suffixes', '.a { &--b__c { margin: 0; } }', '.a--b__c{margin:0}'],
	])('expands %s', async (_name, source, expected) => {
		expect(await expanded(source)).toContain(expected);
	});

	test('expands a selector list of parents with each of them', async () => {
		const css = await expanded('.button, a.button { &--primary { color: blue; } }');

		expect(css).toBe('.button--primary,a.button--primary{color:#00f}');
	});

	test('expands a selector list of suffixes with each parent', async () => {
		const css = await expanded('.a, b.a { &--x, &--y { color: red; } }');

		expect(css).toBe('.a--x,b.a--x,.a--y,b.a--y{color:red}');
	});

	test('keeps nested rules and pseudo-classes of the expanded rule working', async () => {
		const css = await expanded(
			'.button { &--text { color: red; &:hover { svg { color: blue; } } &:not(.x) .y { top: 0; } } }',
		);

		expect(css).toContain('.button--text{color:red}');
		expect(css).toContain('.button--text:hover svg{color:#00f}');
		expect(css).toContain('.button--text:not(.x) .y{top:0}');
	});

	test('expands several levels, each against the selector it produced', async () => {
		const css = await expanded('.a { &--b { color: red; &__c { color: blue; &-d { color: green; } } } }');

		expect(css).toContain('.a--b{color:red}');
		expect(css).toContain('.a--b__c{color:#00f}');
		expect(css).toContain('.a--b__c-d{color:green}');
	});

	test('expands inside a rule nested in a native nested rule', async () => {
		const css = await expanded('.card { .title { &--big { font-size: 2em; } } }');

		expect(css).toContain('.card .title--big{font-size:2em}');
	});

	test('expands inside an at-rule, and an at-rule inside the parent', async () => {
		const css = await expanded(
			'@media (width >= 600px) { .a { &--b { color: red; } } }\n.c { @media (width >= 700px) { &--d { color: blue; } } }',
		);

		expect(css).toContain('@media (min-width:600px){.a--b{color:red}}');
		expect(css).toContain('@media (min-width:700px){.c--d{color:#00f}}');
	});

	test('expands inside :is(), :where() and :not() at the top level', async () => {
		const css = await expanded(
			'.a { :is(&--x, .b) { color: red; } :where(&__y) { color: blue; } .z:not(&--w) { top: 0; } }',
		);

		expect(css).toContain(':is(.a--x,.b)');
		expect(css).toContain(':where(.a__y)');
		expect(css).toContain('.z:not(.a--w)');
	});

	test('keeps the declarations that follow an expanded rule after it', async () => {
		const css = await expanded('.a { color: red; &--b { color: blue; } margin: 0; &:hover { top: 0; } }');

		expect(css.indexOf('.a--b{')).toBeLessThan(css.lastIndexOf('.a{margin:0}'));
		expect(css).toContain('.a:hover{top:0}');
	});

	test('keeps the order of the rules around an expanded rule', async () => {
		const css = await expanded('.a { &--x { top: 1px; } &:hover { top: 2px; } &--y { top: 3px; } }');

		expect(css.indexOf('.a--x')).toBeLessThan(css.indexOf('.a:hover'));
		expect(css.indexOf('.a:hover')).toBeLessThan(css.indexOf('.a--y'));
	});

	test('leaves strings, comments and escapes alone', async () => {
		const css = await expanded(
			'/* .a { &--no { color: red; } } */\n.a { content: "&--no { x"; &--yes { color: blue; } }\n.b\\:c { &--d { top: 0; } }',
		);

		expect(css).not.toContain('--no{');
		expect(css).toContain('content:"&--no { x"');
		expect(css).toContain('.a--yes{color:#00f}');
		expect(css).toContain('.b\\:c--d{top:0}');
	});

	test('leaves native nesting as it is', async () => {
		const css = await expanded('.a { & .b { top: 0; } &.c { top: 1px; } .d & { top: 2px; } & > p { top: 3px; } }');

		expect(css).toContain('.a .b{top:0}');
		expect(css).toContain('.a.c{top:1px}');
		expect(css).toContain('.d .a{top:2px}');
	});

	test('keeps a custom property with braces and a url with a semicolon', async () => {
		const css = await expanded(
			'.a { --x: { a: b }; background: url(data:image/png;base64,AA==); &--y { top: 0; } }',
		);

		expect(css).toContain('.a--y{top:0}');
		expect(css).toContain('base64,AA==');
	});

	test('expands a rule imported from a partial, and one in the entry', async () => {
		write('src/parts.css', '.card { &--wide { margin: 0; } }\n');
		const file = write('src/main.css', '@import "./parts.css";\n.menu {\n  &-item { color: red; }\n}\n');

		const { css } = await transform(file);

		expect(css).toContain('.card--wide{margin:0}');
		expect(css).toContain('.menu-item{color:red}');
	});

	test('expands a partial imported by a partial', async () => {
		write('src/deep.css', '.deep { &__x { top: 0; } }');
		write('src/mid.css', '@import "./deep.css";\n.mid { &__y { top: 1px; } }');
		const file = write('src/main.css', '@import "./mid.css";\n.main { &__z { top: 2px; } }');

		const { css } = await transform(file);

		expect(css).toContain('.deep__x{top:0}');
		expect(css).toContain('.mid__y{top:1px}');
		expect(css).toContain('.main__z{top:2px}');
	});

	test('scopes the classes of a CSS Module after the expansion', async () => {
		const file = write('src/button.module.css', '.button { color: red; &--primary { color: blue; } }');

		const { css, exports } = await transform(file);

		expect(Object.keys(exports ?? {})).toEqual(['button', 'button--primary']);
		const [button, primary] = [exports!.button!, exports!['button--primary']!];
		expect(button).not.toBe(primary);
		expect(css).toContain(`.${primary}{color:#00f}`);
	});

	test('expands a CSS Module imported partial', async () => {
		write('src/base.css', '.base { &--on { top: 0; } }');
		const file = write('src/a.module.css', '@import "./base.css";\n.a { top: 1px; }');

		const { css } = await transform(file);

		expect(css).toMatch(/\.\w+_base--on\{top:0\}/u);
	});

	test('keeps the file of a Tailwind stylesheet working: @apply inside an expanded block', async () => {
		const { processor, write: writeApp } = await createTailwindApp({
			plugins: [suffixNesting()],
			targets: ['chrome 90'],
		});
		writeApp('src/pages/index.tsx', '<div />');
		const source = '.btn { @apply p-4; &--wide { @apply px-8; &:hover { @apply bg-brand; } } }';
		const file = writeApp('src/pages/index.css', source);

		const { css } = await processor.transformStylesheet(source, file);

		expect(css).toMatch(/\.btn--wide\s*\{[^}]*padding-inline/u);
		expect(css).toMatch(/\.btn--wide:hover\s*\{[^}]*background-color/u);
		expect(css).not.toContain('@apply');
	});

	test('expands the partials a Tailwind stylesheet inlines', async () => {
		const { processor, write: writeApp } = await createTailwindApp({ plugins: [suffixNesting()] });
		writeApp('src/pages/part.css', '.part { &--x { color: blue; } }');
		const source = '@import "./part.css";\n.btn { @apply p-4; &--y { color: red; } }';
		const file = writeApp('src/pages/index.css', source);

		const { css } = await processor.transformStylesheet(source, file);

		expect(css).toMatch(/\.part--x\s*\{/u);
		expect(css).toMatch(/\.btn--y\s*\{/u);
	});

	test('applies @apply inside a partial Tailwind inlines, and reports the partial as a dependency', async () => {
		const { processor, write: writeApp } = await createTailwindApp({
			plugins: [suffixNesting()],
			targets: ['chrome 90'],
		});
		const part = writeApp('src/pages/part.css', '.part { &--x { @apply p-4; } }');
		const source = '@import "./part.css";\n.btn { @apply p-4; }';
		const file = writeApp('src/pages/index.css', source);

		const { css, dependencies } = await processor.transformStylesheet(source, file);

		expect(css).toMatch(/\.part--x[^{]*\{[^}]*padding/u);
		expect(dependencies).toContain(part);
		expect(dependencies!.every((dependency) => !dependency.includes('ecopages-lightningcss-'))).toBe(true);
	});

	test('rebases the urls of a partial Tailwind inlines, and resolves its own imports from the partial', async () => {
		const { processor, write: writeApp } = await createTailwindApp({
			plugins: [suffixNesting()],
			targets: ['chrome 90'],
		});
		const image = writeApp('src/shared/img/a.png', 'x');
		writeApp('src/shared/deep.css', '.deep { top: 0; }');
		writeApp(
			'src/shared/part.css',
			'@import "./deep.css";\n.part { background: url(./img/a.png); &--x { top: 1px; } }',
		);
		const source = '@import "../shared/part.css";\n.btn { @apply p-4; }';
		const file = writeApp('src/pages/index.css', source);

		const { css } = await processor.transformStylesheet(source, file);

		expect(css).toContain('.deep');
		expect(css).toMatch(/\.part--x\s*\{/u);
		const url = /url\("([^"]+)"\)/u.exec(css)![1]!;
		expect(fs.realpathSync(path.resolve(path.dirname(file), url))).toBe(fs.realpathSync(image));
	});

	test('expands a partial imported through a tsconfig alias that Tailwind inlines', async () => {
		const { processor, write: writeApp } = await createTailwindApp({
			plugins: [suffixNesting()],
			targets: ['chrome 90'],
		});
		writeApp(
			'tsconfig.json',
			JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@styles/*': ['src/styles/*'] } } }),
		);
		writeApp('src/styles/button.css', '.button { @apply p-4; &--primary { top: 0; } }');
		const source = '@import "@styles/button.css";\n.a { @apply p-2; }';
		const file = writeApp('src/pages/index.css', source);

		const { css } = await processor.transformStylesheet(source, file);

		expect(css).toMatch(/\.button--primary\s*\{/u);
		expect(css).toMatch(/\.button\s*\{[^}]*padding/u);
	});

	test('leaves a partial no plugin changes to Tailwind', async () => {
		const { processor, write: writeApp } = await createTailwindApp({
			plugins: [suffixNesting()],
			targets: ['chrome 90'],
		});
		writeApp('src/pages/plain.css', '.plain { @apply p-4; }');
		const source = '@import "./plain.css";\n.btn { @apply p-2; }';
		const file = writeApp('src/pages/index.css', source);

		const { css } = await processor.transformStylesheet(source, file);

		expect(css).toMatch(/\.plain\s*\{[^}]*padding/u);
	});
});

describe('errors', () => {
	test.each([
		['a combinator', '.card .title { &--big { top: 0; } }', '.card .title'],
		['a child combinator', '.card > .title {\n\n  &--big { top: 0; }\n}', '.card > .title'],
		['a pseudo-class', '.a:hover { &--b { top: 0; } }', '.a:hover'],
		['an attribute', '.a[x] { &--b { top: 0; } }', '.a[x]'],
		['a function', '.a:is(.b) { &--b { top: 0; } }', '.a:is(.b)'],
	])('fails when the parent has %s, naming file, position and selector', async (_name, source, parent) => {
		const file = write('src/a.css', source);

		const failure = (await transform(file).catch((error: Error) => error)) as Error;

		expect(failure).toBeInstanceOf(Error);
		const line = source.split('\n').findIndex((text) => text.includes('&--big') || text.includes('&--b')) + 1;
		expect(failure.message).toContain(`${file}:`);
		expect(failure.message).toMatch(new RegExp(`${file.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}:\\d+:\\d+ `, 'u'));
		expect(failure.message).toContain(`\`${parent}\``);
		expect(failure.message).toContain('&--b');
		expect(line).toBeGreaterThan(0);
	});

	test('reports the line and column of the rule in the stylesheet as written', async () => {
		const file = write(
			'src/a.css',
			'.ok { &--fine { top: 0; } }\n\n.card .title {\n  color: red;\n  &--big { top: 0; }\n}\n',
		);

		const failure = (await transform(file).catch((error: Error) => error)) as Error;

		expect(failure.message).toContain(`${file}:5:3 `);
	});

	test('names every rule of a partial that cannot be expanded, with the path of the partial', async () => {
		write('src/parts.css', '.a b { &--x { top: 0; } }\n.c d { &__y { top: 0; } }');
		const file = write('src/main.css', '@import "./parts.css";\n.ok { top: 0; }');

		const failure = (await transform(file).catch((error: Error) => error)) as Error;

		expect(failure.message).toContain(`${path.join(rootDir, 'src/parts.css')}:1:`);
		expect(failure.message).toContain(`${path.join(rootDir, 'src/parts.css')}:2:`);
	});

	test('fails a rule that mixes a suffix with other selectors', async () => {
		const file = write('src/a.css', '.a { &--b, &:hover { top: 0; } }');

		await expect(transform(file)).rejects.toThrow(/mixes suffix nesting with other selectors/u);
	});

	test('fails a suffix away from the start inside a nested parent, which cannot be placed', async () => {
		const file = write('src/a.css', '.card { .title { .dark &--big { top: 0; } } }');

		await expect(transform(file)).rejects.toThrow(/itself nested/u);
	});

	test('fails a rule that also uses a plain &', async () => {
		const file = write('src/a.css', '.a { &--b + & { top: 0; } }');

		await expect(transform(file)).rejects.toThrow(/another `&`/u);
	});

	test('still fails what the plugin leaves invalid, with the error of the Processor', async () => {
		const file = write('src/a.css', '.a { :has(&--x) { top: 0; } }');

		await expect(transform(file)).rejects.toThrow(/&--x.*Sass-style suffix nesting/su);
	});

	test('without the plugin, suffix nesting still fails the build and points at the plugin', async () => {
		const file = write('src/a.css', '.a { &--b { color: red; } }');

		const failure = (await transform(file, { plugins: [] }).catch((error: Error) => error)) as Error;

		expect(failure.message).toContain(`${file}:1:6`);
		expect(failure.message).toContain('Sass-style suffix nesting');
		expect(failure.message).toContain('suffixNesting()');
	});
});

describe('the diagnostics of the Processor', () => {
	test('names every suffix nesting pair of a selector', async () => {
		const file = write('src/a.css', '.a { &--x &--y { top: 0; } :is(&__p, &__q) { top: 1px; } }');

		const failure = (await transform(file, { plugins: [] }).catch((error: Error) => error)) as Error;

		for (const selector of ['&--x', '&--y', '&__p', '&__q']) expect(failure.message).toContain(`\`${selector}\``);
	});

	test('gives a type selector after & its own message', async () => {
		const file = write('src/a.css', '.a { &div { top: 0; } }');

		const failure = (await transform(file, { plugins: [] }).catch((error: Error) => error)) as Error;

		expect(failure.message).toContain('`&div` puts a type selector after `&`');
		expect(failure.message).toContain('`div&`');
		expect(failure.message).not.toContain('Sass-style');
	});
});

describe('plugins', () => {
	test('rewrite the source in the order of the array', async () => {
		const file = write('src/a.css', '.a { top: 0; }');
		const order: string[] = [];

		const { css } = await transform(file, {
			plugins: [
				{ name: 'one', transformSource: async (source) => (order.push('one'), `${source}.one{top:1px}`) },
				{ name: 'two', transformSource: (source) => (order.push('two'), `${source}.two{top:2px}`) },
			],
		});

		expect(order).toEqual(['one', 'two']);
		expect(css).toBe('.a{top:0}.one{top:1px}.two{top:2px}');
	});

	test('give transformSource the file, for the entry and for a partial', async () => {
		write('src/part.css', '.p { top: 0; }');
		const file = write('src/a.css', '@import "./part.css";\n.a { top: 1px; }');
		const files: string[] = [];

		await transform(file, {
			plugins: [{ name: 'spy', transformSource: (source, name) => (files.push(name), source) }],
		});

		expect(files).toEqual([file, path.join(rootDir, 'src/part.css')]);
	});

	test('run their visitors together with the visitor of the app', async () => {
		const file = write('src/a.css', '.a { color: red; }');
		const calls: string[] = [];

		const { css } = await transform(file, {
			plugins: [
				{
					name: 'plugin',
					visitor: {
						Rule: {
							style(rule) {
								calls.push('plugin');
								return {
									...rule,
									value: {
										...rule.value,
										declarations: { declarations: [], importantDeclarations: [] },
									},
								};
							},
						},
					},
				},
			],
			visitor: { Rule: { style: () => void calls.push('app') } },
		});

		expect(calls).toEqual(['plugin', 'app']);
		expect(css).toBe('');
	});

	test('run before the check for invalid suffix nesting, so a rule a plugin rewrites passes', async () => {
		const file = write('src/a.css', '.a { color: red; }');
		let rewritten = false;

		const { css } = await transform(file, {
			plugins: [
				{
					name: 'rewrite',
					visitor: {
						Rule: {
							style(rule) {
								if (rewritten) return undefined;
								rewritten = true;
								return {
									...rule,
									value: {
										...rule.value,
										rules: [
											{
												type: 'style',
												value: {
													loc: rule.value.loc,
													selectors: [[{ type: 'nesting' }, { type: 'type', name: '--x' }]],
													declarations: rule.value.declarations,
													rules: [],
												},
											},
										],
									},
								};
							},
						},
					},
				},
			],
		}).catch((error: Error) => ({ css: error.message }));

		expect(css).toContain('&--x');
	});

	test('fail with the name of the plugin when transformSource throws', async () => {
		const file = write('src/a.css', '.a { top: 0; }');

		await expect(
			transform(file, {
				plugins: [
					{
						name: 'broken',
						transformSource: () => {
							throw new Error('no good');
						},
					},
				],
			}),
		).rejects.toThrow(/plugin broken: no good/u);
	});

	test('do nothing when there are none', async () => {
		const file = write('src/a.css', '.a { top: 0; }');

		expect((await transform(file, { plugins: [] })).css).toBe('.a{top:0}');
	});
});

describe('expandSuffixNesting', () => {
	test('returns a stylesheet without suffix nesting as it is', () => {
		const css = '.a {\n  &:hover { top: 0; }\n}\n';

		expect(expandSuffixNesting(css, 'a.css')).toBe(css);
	});

	test('returns a stylesheet with unbalanced braces as it is, for Lightning CSS to report', () => {
		const css = '.a { &--b { top: 0; }';

		expect(expandSuffixNesting(css, 'a.css')).toBe(css);
	});

	test('writes the expanded rule after the rule it came from', () => {
		expect(expandSuffixNesting('.a {\n  top: 0;\n  &--b {\n    top: 1px;\n  }\n}\n', 'a.css')).toBe(
			'.a {\n  top: 0;}\n\n.a--b {\n    top: 1px;\n  }\n',
		);
	});
});
