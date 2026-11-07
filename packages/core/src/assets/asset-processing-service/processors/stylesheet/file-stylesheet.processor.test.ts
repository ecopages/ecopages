import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { hashBrowserAssetBytes } from '../../../hashed-browser-asset.ts';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { FileStylesheetProcessor } from './file-stylesheet.processor.ts';
import { appLogger } from '../../../../global/app-logger.ts';
import { rebaseStylesheetReferences } from './app-stylesheet-imports.ts';
import { Processor } from '../../../../plugins/processor.ts';

let rootDir: string;

function createConfig(): EcoPagesAppConfig {
	return {
		rootDir,
		srcDir: 'src',
		distDir: '.eco/public',
		absolutePaths: {
			distDir: path.join(rootDir, '.eco/public'),
			srcDir: path.join(rootDir, 'src'),
		},
		processors: new Map(),
		loaders: new Map(),
	} as unknown as EcoPagesAppConfig;
}

beforeEach(() => {
	rootDir = path.fromNative(mkdtempSync(path.join(tmpdir(), 'file-stylesheet-')));
	mkdirSync(path.join(rootDir, 'src'), { recursive: true });
	vi.stubEnv('NODE_ENV', 'production');
});

afterEach(() => {
	vi.unstubAllEnvs();
	rmSync(rootDir, { recursive: true, force: true });
});

test('names the stylesheet from a hash of the processed bytes and keeps the name when they are unchanged', async () => {
	const source = path.join(rootDir, 'src', 'site.css');
	writeFileSync(source, 'body { color: red; }');
	const processor = new FileStylesheetProcessor({ appConfig: createConfig() });
	const first = await processor.process({
		kind: 'stylesheet',
		source: 'file',
		filepath: source,
		inline: false,
	});
	const second = await new FileStylesheetProcessor({ appConfig: createConfig() }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath: source,
		inline: false,
	});
	const hash = hashBrowserAssetBytes('body { color: red; }');

	expect(first.filepath).toBe(path.join(rootDir, '.eco/public/assets', `${hash}.css`));
	expect(second.filepath).toBe(first.filepath);
	expect(readFileSync(first.filepath!, 'utf-8')).toBe('body { color: red; }');
});

test('changes the stylesheet URL when the processed bytes change', async () => {
	const source = path.join(rootDir, 'src', 'site.css');
	writeFileSync(source, 'body { color: red; }');
	const processor = new FileStylesheetProcessor({ appConfig: createConfig() });
	const first = await processor.process({
		kind: 'stylesheet',
		source: 'file',
		filepath: source,
		inline: false,
	});
	writeFileSync(source, 'body { color: blue; }');
	const edited = await new FileStylesheetProcessor({ appConfig: createConfig() }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath: source,
		inline: false,
	});

	expect(edited.filepath).not.toBe(first.filepath);
	expect(path.basename(edited.filepath!)).toBe(`${hashBrowserAssetBytes('body { color: blue; }')}.css`);
});

function writePackageFile(name: string, contents: string | Buffer): string {
	const packageRoot = path.join(rootDir, 'node_modules/some-lib');
	mkdirSync(packageRoot, { recursive: true });
	writeFileSync(path.join(packageRoot, 'package.json'), '{ "name": "some-lib" }');
	const file = path.join(rootDir, 'node_modules/some-lib', name);
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, contents);
	return file;
}

test('emits the files a package stylesheet references and rewrites its relative urls, without Processors', async () => {
	const font = Buffer.from([0x77, 0x4f, 0x46, 0x32, 1, 2, 3]);
	writePackageFile('dist/fonts/x.woff2', font);
	writePackageFile('dist/icons.svg', '<svg/>');
	const stylesheet = writePackageFile(
		'dist/style.css',
		[
			'/* url(./fonts/missing.woff2) */',
			"@font-face { font-family: X; src: url('./fonts/x.woff2') format('woff2'), url(icons.svg#glyph); }",
			'.a { background: url(data:image/png;base64,AAAA), url(/root.png), url(https://cdn.example/x.png); }',
			'.b { color: theme(colors.red); }',
		].join('\n'),
	);
	const transformStylesheet = vi.fn(async (content: string) => ({ css: `${content}\n/* processed */` }));
	const appConfig = createConfig();
	appConfig.processors.set('postcss', {
		transformStylesheet,
		canProcessAsset: () => true,
		getAssetCapabilities: () => [],
	} as never);

	const processed = await new FileStylesheetProcessor({ appConfig }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath: stylesheet,
		fromPackage: 'some-lib/dist/style.css',
	});
	const assetsDir = path.join(rootDir, '.eco/public/assets');
	const css = readFileSync(processed.filepath!, 'utf-8');
	const fontName = `${hashBrowserAssetBytes(font)}.woff2`;
	const iconName = `${hashBrowserAssetBytes('<svg/>')}.svg`;

	expect(transformStylesheet).not.toHaveBeenCalled();
	expect(path.dirname(processed.filepath!)).toBe(assetsDir);
	expect(css).toContain(`src: url("${fontName}") format('woff2'), url("${iconName}#glyph");`);
	expect(readFileSync(path.join(assetsDir, fontName))).toEqual(font);
	expect(css).toContain('/* url(./fonts/missing.woff2) */');
	expect(css).toContain('url(data:image/png;base64,AAAA), url(/root.png), url(https://cdn.example/x.png)');
	expect(css).toContain('theme(colors.red)');
});

test('inlines the relative @import of a package stylesheet with its urls rewritten from its own location', async () => {
	writePackageFile('dist/base/fonts/y.woff', 'font-y');
	writePackageFile('dist/base/base.css', '.base { src: url(fonts/y.woff); }');
	const stylesheet = writePackageFile('dist/style.css', "@import './base/base.css';\n.top {}");

	const processed = await new FileStylesheetProcessor({ appConfig: createConfig() }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath: stylesheet,
		fromPackage: 'some-lib/dist/style.css',
	});

	expect(readFileSync(processed.filepath!, 'utf-8')).toBe(
		`.base { src: url("${hashBrowserAssetBytes('font-y')}.woff"); }\n.top {}`,
	);
});

test('fails on a package stylesheet url that names a missing file', async () => {
	const stylesheet = writePackageFile('dist/style.css', '.a { background: url(./missing.png); }');

	await expect(
		new FileStylesheetProcessor({ appConfig: createConfig() }).process({
			kind: 'stylesheet',
			source: 'file',
			filepath: stylesheet,
			fromPackage: 'some-lib/dist/style.css',
		}),
	).rejects.toThrow(`${stylesheet}: url(./missing.png) names`);
});

function processPackageStylesheet(filepath: string) {
	return new FileStylesheetProcessor({ appConfig: createConfig() }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath,
		fromPackage: 'some-lib/dist/style.css',
	});
}

async function preparedCss(filepath: string): Promise<string> {
	return readFileSync((await processPackageStylesheet(filepath)).filepath!, 'utf-8');
}

test('inlines a package @import once', async () => {
	const other = path.join(rootDir, 'node_modules/other-lib');
	mkdirSync(other, { recursive: true });
	writeFileSync(
		path.join(other, 'package.json'),
		JSON.stringify({ name: 'other-lib', exports: { './x.css': './x.css' } }),
	);
	writeFileSync(path.join(other, 'x.css'), '.other {}');
	const stylesheet = writePackageFile(
		'dist/style.css',
		"@import 'other-lib/x.css';\n@import './style.css';\n.top {}",
	);

	expect(await preparedCss(stylesheet)).toBe('.other {}\n\n.top {}');
});

test('leaves url() inside strings and comments alone and reads escaped urls', async () => {
	writePackageFile('dist/i).svg', '<svg id="paren"/>');
	const stylesheet = writePackageFile(
		'dist/style.css',
		[
			'.a::before { content: "url(./nope.png)"; }',
			'.b::before { content: "a\\"b url(x.png)"; }',
			'.c::before { content: "/*"; }',
			'.d { background: url(i\\).svg); }',
		].join('\n'),
	);
	const css = await preparedCss(stylesheet);

	expect(css).toContain('content: "url(./nope.png)";');
	expect(css).toContain('content: "a\\"b url(x.png)";');
	expect(css).toContain('.c::before { content: "/*"; }');
	expect(css).toContain(`.d { background: url("${hashBrowserAssetBytes('<svg id="paren"/>')}.svg"); }`);
});

test('rewrites the string references of image-set()', async () => {
	writePackageFile('dist/i.svg', '<svg/>');
	const stylesheet = writePackageFile('dist/style.css', '.a { background: image-set("./i.svg" 1x, url(i.svg) 2x); }');

	const name = `${hashBrowserAssetBytes('<svg/>')}.svg`;
	expect(await preparedCss(stylesheet)).toBe(`.a { background: image-set("${name}" 1x, url("${name}") 2x); }`);
});

test('copies no file but a font, image or media file, and inlines only a stylesheet', async () => {
	const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);
	mkdirSync(path.join(rootDir, 'outside'), { recursive: true });
	writeFileSync(path.join(rootDir, 'outside/secret.txt'), 'secret');
	const url = writePackageFile('dist/url.css', '.a { background: url(../../../outside/secret.txt); }');
	const imported = writePackageFile('dist/import.css', "@import '../../../outside/secret.txt';");

	const processed = await processPackageStylesheet(url);
	await expect(processPackageStylesheet(imported)).rejects.toThrow('which is not a stylesheet');

	expect(readFileSync(processed.filepath!, 'utf-8')).toBe('.a { background: url(../../../outside/secret.txt); }');
	expect(warn).toHaveBeenCalledWith(expect.stringContaining('is not a font, image or media file'));
	const assetsDir = path.join(rootDir, '.eco/public/assets');
	expect(readdirSync(assetsDir).filter((file) => file.endsWith('.txt'))).toEqual([]);
});

test('emits a sibling dependency font a package stylesheet names in a monorepo store', async () => {
	const repo = rootDir;
	rootDir = path.join(repo, 'apps/web');
	mkdirSync(path.join(rootDir, 'src'), { recursive: true });
	const store = path.join(repo, 'node_modules/.pnpm');
	const font = path.join(store, 'b@1.0.0/node_modules/b/files/b.woff2');
	mkdirSync(path.dirname(font), { recursive: true });
	writeFileSync(font, 'sibling-font');
	const stylesheet = path.join(store, 'a@1.0.0/node_modules/a/style.css');
	mkdirSync(path.dirname(stylesheet), { recursive: true });
	writeFileSync(path.join(path.dirname(stylesheet), 'package.json'), '{ "name": "a" }');
	writeFileSync(stylesheet, '@font-face { src: url(../../../b@1.0.0/node_modules/b/files/b.woff2); }');

	try {
		const processed = await processPackageStylesheet(stylesheet);
		const fontName = `${hashBrowserAssetBytes('sibling-font')}.woff2`;

		expect(readFileSync(processed.filepath!, 'utf-8')).toBe(`@font-face { src: url("${fontName}"); }`);
		expect(readFileSync(path.join(rootDir, '.eco/public/assets', fontName), 'utf-8')).toBe('sibling-font');
	} finally {
		rootDir = repo;
	}
});

test('hoists remote @imports and @charset of inlined files and reads a final @import without a semicolon', async () => {
	writePackageFile('dist/base.css', '@charset "utf-8";\n.base {}\n@import url("https://cdn.example/font.css");');
	writePackageFile('dist/last.css', '.last {}');
	const stylesheet = writePackageFile('dist/style.css', ".top {}\n@import './base.css';\n@import './last.css'");

	expect(await preparedCss(stylesheet)).toBe(
		'@charset "utf-8";\n@import url("https://cdn.example/font.css");\n.top {}\n\n.base {}\n\n.last {}',
	);
});

test('wraps the inlined contents of a conditional @import in its layer, supports and media blocks', async () => {
	writePackageFile('dist/part.css', '.part {}');
	writePackageFile('dist/print.css', '.print {}');
	const stylesheet = writePackageFile(
		'dist/style.css',
		"@import './part.css' layer(lib) supports(display: grid) screen and (min-width: 1px);\n@import url(print.css) layer print;",
	);

	expect(await preparedCss(stylesheet)).toBe(
		[
			'@layer lib {',
			'@supports (display: grid) {',
			'@media screen and (min-width: 1px) {',
			'.part {}',
			'}',
			'}',
			'}',
			'@layer {',
			'@media print {',
			'.print {}',
			'}',
			'}',
		].join('\n'),
	);
});

function writeAppFile(name: string, contents: string | Buffer): string {
	const file = path.join(rootDir, name);
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, contents);
	return file;
}

test('emits the files the processed output of an app stylesheet references, resolved from the source file', async () => {
	writePackageFile('files/x.woff2', 'font-x');
	writeAppFile('src/images/bg.png', 'png');
	const stylesheet = writeAppFile('src/styles/site.css', '@import "some-lib";');
	const appConfig = createConfig();
	appConfig.processors.set('postcss', {
		transformStylesheet: async () => ({
			css: "@import url(/remote.css);\n@font-face { src: url('../../node_modules/some-lib/files/x.woff2?v=1'); }\n.a { background: url(../images/bg.png), url(/root.png); }",
		}),
		canProcessAsset: () => true,
		getAssetCapabilities: () => [],
	} as never);

	const processed = await new FileStylesheetProcessor({ appConfig }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath: stylesheet,
	});
	const assetsDir = path.join(rootDir, '.eco/public/assets');
	const fontName = `${hashBrowserAssetBytes('font-x')}.woff2`;
	const imageName = `${hashBrowserAssetBytes('png')}.png`;

	expect(readFileSync(processed.filepath!, 'utf-8')).toBe(
		`@import url(/remote.css);\n@font-face { src: url("${fontName}?v=1"); }\n.a { background: url("${imageName}"), url(/root.png); }`,
	);
	expect(readFileSync(path.join(assetsDir, fontName), 'utf-8')).toBe('font-x');
	expect(existsSync(path.join(assetsDir, imageName))).toBe(true);
});

test('names emitted files relative to a development stylesheet and root-relative in an inline one', async () => {
	vi.stubEnv('NODE_ENV', 'development');
	writeAppFile('src/images/bg.png', 'png');
	const stylesheet = writeAppFile('src/styles/site.css', '.a { background: url(../images/bg.png); }');
	const imageName = `${hashBrowserAssetBytes('png')}.png`;

	const linked = await new FileStylesheetProcessor({ appConfig: createConfig() }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath: stylesheet,
	});
	const inline = await new FileStylesheetProcessor({ appConfig: createConfig() }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath: stylesheet,
		inline: true,
	});

	expect(linked.filepath).toBe(path.join(rootDir, '.eco/public/assets/styles/site.css'));
	expect(readFileSync(linked.filepath!, 'utf-8')).toBe(`.a { background: url("../${imageName}"); }`);
	expect(inline.content).toBe(`.a { background: url("/assets/${imageName}"); }`);
});

test('leaves an app stylesheet url to a missing file as written, with a warning', async () => {
	const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);
	const stylesheet = writeAppFile('src/site.css', '.a { background: url(hero.png); }');

	const processed = await new FileStylesheetProcessor({ appConfig: createConfig() }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath: stylesheet,
	});

	expect(readFileSync(processed.filepath!, 'utf-8')).toBe('.a { background: url(hero.png); }');
	expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${stylesheet}: url(hero.png) names`));
});

test('warns once about a missing reference when the stylesheet is processed in two passes', async () => {
	const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);
	const stylesheet = writeAppFile('src/site.css', '.a { background: url(hero.png); }');
	const dep = { kind: 'stylesheet', source: 'file', filepath: stylesheet } as const;

	await new FileStylesheetProcessor({ appConfig: createConfig() }).process(dep);
	await new FileStylesheetProcessor({ appConfig: createConfig() }).process({ ...dep, inline: true });

	expect(warn).toHaveBeenCalledTimes(1);
});

test('skips a url() holding a custom property without a warning', async () => {
	const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);
	const css = '.a { background: url(var(--hero)) , url( var(--other, "x.png") ); }';
	const stylesheet = writeAppFile('src/site.css', css);

	const processed = await new FileStylesheetProcessor({ appConfig: createConfig() }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath: stylesheet,
	});

	expect(readFileSync(processed.filepath!, 'utf-8')).toBe(css);
	expect(warn).not.toHaveBeenCalled();
});

test('never copies a dotfile an app stylesheet names, such as one an inlined package reaches', async () => {
	const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);
	writeAppFile('package.json', '{ "name": "app" }');
	writeAppFile('.env', 'SECRET=1');
	const stylesheet = writeAppFile('src/styles/site.css', '.e { background: url("../../.env"); }');

	const processed = await new FileStylesheetProcessor({ appConfig: createConfig() }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath: stylesheet,
	});

	expect(readFileSync(processed.filepath!, 'utf-8')).toBe('.e { background: url("../../.env"); }');
	expect(readdirSync(path.join(rootDir, '.eco/public/assets')).filter((file) => !file.endsWith('.css'))).toEqual([
		'.ecopages-hashed-assets',
	]);
	expect(warn).toHaveBeenCalledWith(expect.stringContaining('is not a font, image or media file'));
});

test('rebases inlined references with the tokenizer', () => {
	writePackageFile('files/a(1).woff2', 'font');
	const packageCss = writePackageFile('index.css', '');
	const entry = writeAppFile('src/styles/site.css', '');

	expect(
		rebaseStylesheetReferences(
			'url(files/a\\(1\\).woff2) format("woff2"), url(data:x), local("url(x.png)")',
			packageCss,
			entry,
		),
	).toBe('url("../../node_modules/some-lib/files/a(1).woff2") format("woff2"), url(data:x), local("url(x.png)")');
});

class FailingStylesheetProcessor extends Processor {
	constructor() {
		super({ name: 'failing-css', capabilities: [{ kind: 'stylesheet' }] });
	}

	override async setup(): Promise<void> {}

	override async transformStylesheet(_css: string, file: string): Promise<{ css: string }> {
		throw new Error(`${file}:3:5 Unknown word`);
	}
}

test('rejects and writes no stylesheet when a Processor throws', async () => {
	const source = path.join(rootDir, 'src', 'main.css');
	writeFileSync(source, 'body { color: red; }');
	const config = createConfig();
	config.processors = new Map([['failing-css', new FailingStylesheetProcessor()]]);

	await expect(
		new FileStylesheetProcessor({ appConfig: config }).process({
			kind: 'stylesheet',
			source: 'file',
			filepath: source,
			inline: false,
		}),
	).rejects.toThrow(`${source}:3:5 Unknown word`);

	const assetsDir = path.join(rootDir, '.eco/public/assets');
	expect(existsSync(assetsDir) ? readdirSync(assetsDir) : []).toEqual([]);
});

test('writes a development stylesheet of a declared extension under a .css name', async () => {
	vi.stubEnv('NODE_ENV', 'development');
	class SassProcessor extends Processor {
		async setup(): Promise<void> {}
		override async transformStylesheet(css: string): Promise<{ css: string }> {
			return { css: css.replace('$c', 'red') };
		}
	}
	const appConfig = createConfig();
	appConfig.processors.set(
		'sass',
		new SassProcessor({ name: 'sass', capabilities: [{ kind: 'stylesheet', extensions: ['*.scss'] }] }),
	);
	const stylesheet = writeAppFile('src/styles/card.scss', '.card { color: $c; }');

	const processed = await new FileStylesheetProcessor({ appConfig }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath: stylesheet,
	});

	expect(processed.filepath).toBe(path.join(rootDir, '.eco/public/assets/styles/card.scss.css'));
	expect(readFileSync(processed.filepath!, 'utf-8')).toBe('.card { color: red; }');
});

test('lists the partials the Processor inlined among the sources bundled into the stylesheet', async () => {
	const partial = writeAppFile('src/styles/base.css', '.base { color: red; }');
	class InliningProcessor extends Processor {
		async setup(): Promise<void> {}
		override async transformStylesheet(css: string) {
			return { css: css.replace("@import './base.css';", '.base { color: red; }'), dependencies: [partial] };
		}
	}
	const appConfig = createConfig();
	appConfig.processors.set(
		'inlining',
		new InliningProcessor({ name: 'inlining', capabilities: [{ kind: 'stylesheet', extensions: ['*.css'] }] }),
	);
	const stylesheet = writeAppFile('src/styles/main.css', "@import './base.css';");

	const processed = await new FileStylesheetProcessor({ appConfig }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath: stylesheet,
	});

	expect(processed.bundledSourceFilepaths).toEqual([partial]);
});

test('inlines a relative @import with no Processor, emits the files its url() names and lists the partial', async () => {
	writeAppFile('src/img/bg.png', 'png-bytes');
	const partial = writeAppFile('src/styles/partials/buttons.css', ".button { background: url('../../img/bg.png'); }");
	const stylesheet = writeAppFile('src/styles/main.css', "@import './partials/buttons.css';\n.main {}");

	const processed = await new FileStylesheetProcessor({ appConfig: createConfig() }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath: stylesheet,
	});

	const emitted = `${hashBrowserAssetBytes('png-bytes')}.png`;
	expect(readFileSync(processed.filepath!, 'utf-8')).toBe(`.button { background: url("${emitted}"); }\n.main {}`);
	expect(readFileSync(path.join(rootDir, '.eco/public/assets', emitted), 'utf-8')).toBe('png-bytes');
	expect(processed.bundledSourceFilepaths).toEqual([partial]);
});

test('writes the scoped CSS of a CSS Module as the stylesheet the Page links', async () => {
	class ScopingProcessor extends Processor {
		async setup(): Promise<void> {}
		override async transformStylesheet(css: string) {
			return { css: css.replace('.card', '.x_card'), exports: { card: 'x_card' } };
		}
	}
	const appConfig = createConfig();
	appConfig.processors.set(
		'scoping',
		new ScopingProcessor({
			name: 'scoping',
			capabilities: [{ kind: 'stylesheet', extensions: ['*.css'], cssModules: true }],
		}),
	);
	const stylesheet = writeAppFile('src/components/card.module.css', '.card { color: red; }');

	const processed = await new FileStylesheetProcessor({ appConfig }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath: stylesheet,
		inline: false,
	});

	expect(readFileSync(processed.filepath!, 'utf-8')).toBe('.x_card { color: red; }');
});
