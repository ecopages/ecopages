import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import { path } from '@ecopages/file-system/path';
import { Logger } from '@ecopages/logger';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import { inlineStylesheetImports } from '@ecopages/core/processor';
import { LightningCssProcessorPlugin } from '../plugin';

let rootDir: string;
const write = (relativePath: string, contents: string): string => {
	const file = path.join(rootDir, relativePath);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, contents);
	return file;
};

async function transform(file: string, css = fs.readFileSync(file, 'utf8')) {
	const plugin = new LightningCssProcessorPlugin({ options: { minify: true } });
	plugin.setContext(await finalizeEcoPagesConfig({ rootDir, srcDir: 'src', distDir: 'dist' }));
	return plugin.transformStylesheet(css, file);
}

describe('@import bundling', () => {
	let warn: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		rootDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lightningcss-bundling-test-')));
		warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined as never);
	});

	afterEach(() => {
		fs.rmSync(rootDir, { recursive: true, force: true });
	});

	test('keeps the layer(), supports() and media conditions of an @import', async () => {
		write('src/styles/base.css', '.base { color: red; }');
		const main = write(
			'src/styles/main.css',
			'@import "./base.css" layer(base) supports(display: grid) screen and (min-width: 600px);',
		);

		const { css } = await transform(main);

		expect(css).toContain('@layer base');
		expect(css).toContain('@supports (display:grid)');
		expect(css).toContain('@media screen and (width>=600px)');
		expect(css).toContain('.base{color:red}');
		expect(css).not.toContain('@import');
	});

	test('emits quoted and unquoted url() references rebased onto the stylesheet', async () => {
		write(
			'src/styles/parts/icons.css',
			'.a { background: url(icon.svg); color: red; }\n.b { background: url("icon.svg"); color: blue; }',
		);
		write('src/styles/parts/icon.svg', '<svg/>');
		const main = write(
			'src/styles/main.css',
			'@import url(./parts/icons.css);\n.c { background: url(local.png); color: red; }\n.d { background: url("local.png"); color: blue; }',
		);

		const { css } = await transform(main);

		expect(css.match(/url\(["']?parts\/icon\.svg["']?\)/g)).toHaveLength(2);
		expect(css.match(/url\(["']?local\.png["']?\)/g)).toHaveLength(2);
	});

	test('resolves a tsconfig alias and a package import', async () => {
		write(
			'tsconfig.json',
			JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@styles/*': ['src/styles/*'] } } }),
		);
		write('src/styles/tokens.css', '.token { color: red; }');
		write(
			'node_modules/theme-kit/package.json',
			JSON.stringify({
				name: 'theme-kit',
				exports: { './extra.css': './extra.css' },
			}),
		);
		write('node_modules/theme-kit/extra.css', '.extra { color: green; }');
		const main = write('src/styles/main.css', '@import "@styles/tokens.css";\n@import "theme-kit/extra.css";');

		const { css, dependencies } = await transform(main);

		expect(css).toContain('.token{color:red}');
		expect(css).toContain('.extra{color:green}');
		expect(dependencies).toEqual(
			expect.arrayContaining([path.join(rootDir, 'src/styles/tokens.css'), expect.stringContaining('extra.css')]),
		);
	});

	test('inlines nested imports, and for a duplicate import the last instance wins', async () => {
		write('src/styles/deep.css', '.deep { color: red; }');
		write('src/styles/mid.css', '@import "./deep.css";\n.mid { color: red; }');
		write('src/styles/shared.css', '.shared { color: red; }');
		write('src/styles/other.css', '.other { color: red; }');
		const main = write(
			'src/styles/main.css',
			'@import "./shared.css";\n@import "./other.css";\n@import "./shared.css";\n@import "./mid.css";',
		);

		const { css, dependencies } = await transform(main);

		expect(css.indexOf('.deep')).toBeLessThan(css.indexOf('.mid'));
		expect(css.match(/\.shared/g)).toHaveLength(1);
		expect(css.indexOf('.other')).toBeLessThan(css.indexOf('.shared'));
		expect(dependencies).toEqual(
			expect.arrayContaining(
				['deep.css', 'mid.css', 'shared.css', 'other.css'].map((name) =>
					path.join(rootDir, 'src/styles', name),
				),
			),
		);
	});

	test.each([
		['a then b', '@import "./a.css";\n@import "./b.css";', '.a{color:red}.b{color:green}'],
		['b then a', '@import "./b.css";\n@import "./a.css";', '.b{color:green}.a{color:red}'],
	])(
		'skips the import that closes a cycle whatever the read order, importing %s',
		async (_name, imports, expected) => {
			write('src/styles/a.css', '@import "./b.css";\n.a { color: red; }');
			write('src/styles/b.css', '@import "./a.css";\n.b { color: green; }');
			const main = write('src/styles/main.css', imports);

			const result = await transform(main);

			expect(result.css).toBe(expected);
			expect(warn).toHaveBeenCalledTimes(1);
		},
	);

	test('warns about a missing partial, naming the importer, and depends on it', async () => {
		const main = write('src/styles/main.css', '@import "./missing.css";\n.a { color: red; }');

		const { css, dependencies } = await transform(main);

		expect(css).toContain('@import "./missing.css"');
		expect(dependencies).toEqual([path.join(rootDir, 'src/styles/missing.css')]);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0]?.[0])).toContain(`@import "./missing.css" in ${main}`);
	});

	test('leaves a file that is not a stylesheet, or a dotfile, as written with a warning', async () => {
		write('src/styles/secret.css.bak', 'x');
		write('src/styles/.hidden.css', '.hidden { color: red; }');
		const main = write(
			'src/styles/main.css',
			'@import "./secret.css.bak";\n@import "./.hidden.css";\n.a { color: red; }',
		);

		const { css, dependencies } = await transform(main);

		expect(css).toContain('@import "./secret.css.bak"');
		expect(css).toContain('@import "./.hidden.css"');
		expect(css).not.toContain('.hidden{');
		expect(dependencies).toEqual([]);
		expect(warn).toHaveBeenCalledTimes(2);
	});

	test('keeps a root-relative or remote import external and hoists it above the bundled CSS', async () => {
		write('src/styles/base.css', '.base { color: red; }');
		const main = write(
			'src/styles/main.css',
			'@import "./base.css";\n@import "/fonts.css";\n@import url("https://example.com/remote.css") screen;\n.a { color: red; }',
		);

		const { css } = await transform(main);

		expect(css.indexOf('@import "/fonts.css"')).toBe(0);
		expect(css.indexOf('@import url("https://example.com/remote.css") screen')).toBeGreaterThan(0);
		expect(css.indexOf('remote.css')).toBeLessThan(css.indexOf('.base'));
		expect(css).toContain('.base{color:red}');
	});

	test('hoists the external imports of a partial where its @import was written', async () => {
		write('src/styles/theme.css', '@import url("https://example.com/base.css");\n.theme { color: red; }');
		const main = write(
			'src/styles/main.css',
			'@import "./theme.css";\n@import url("https://example.com/overrides.css");',
		);

		const { css } = await transform(main);

		expect(css.indexOf('base.css')).toBeLessThan(css.indexOf('overrides.css'));
		expect(css.indexOf('overrides.css')).toBeLessThan(css.indexOf('.theme'));
	});

	test('stops at a failing partial with its own file and position', async () => {
		write('src/styles/broken.css', '.a { color: red; }\n}\n');
		const main = write('src/styles/main.css', '@import "./broken.css";');

		await expect(transform(main)).rejects.toThrow(/broken\.css:\d+:\d+ /);
	});

	describe('against the core scanner', () => {
		const normalize = async (css: string) => {
			const { transform: lightning } = await import('lightningcss');
			return lightning({ filename: 'x.css', code: Buffer.from(css), minify: true }).code.toString();
		};

		test.each([
			[
				'nested imports',
				{ main: '@import "./a.css";\n.main { color: red; }', a: '@import "./b.css";\n.a { color: red; }' },
			],
			['a layer()', { main: '@import "./a.css" layer(base);\n.main { color: red; }', a: '.a { color: red; }' }],
			['a rebased url()', { main: '@import "./sub/a.css";', a: '.a { background: url(img.png); }' }],
			[
				'a remote import',
				{ main: '@import "./a.css";\n@import url("https://example.com/r.css");', a: '.a { color: red; }' },
			],
		])('matches for %s', async (_name, { main: mainCss, a }) => {
			write('src/styles/a.css', a);
			write('src/styles/sub/a.css', a);
			write('src/styles/b.css', '.b { color: red; }');
			write('src/styles/sub/img.png', 'x');
			const main = write('src/styles/main.css', mainCss);

			const ours = await transform(main);
			const core = inlineStylesheetImports(mainCss, main);

			expect(await normalize(ours.css)).toBe(await normalize(core.css));
			expect([...(ours.dependencies ?? [])].sort()).toEqual([...core.dependencies].sort());
		});
	});
});
