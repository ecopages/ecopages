import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { hashBrowserAssetBytes } from '../../../hashed-browser-asset.ts';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { FileStylesheetProcessor } from './file-stylesheet.processor.ts';

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
	rootDir = mkdtempSync(path.join(tmpdir(), 'file-stylesheet-'));
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
	const transformStylesheet = vi.fn(async (content: string) => `${content}\n/* processed */`);
	const appConfig = createConfig();
	appConfig.processors.set('postcss', {
		transformStylesheet,
		canProcessAsset: () => true,
	} as never);

	const processed = await new FileStylesheetProcessor({ appConfig }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath: stylesheet,
		fromPackage: true,
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
		fromPackage: true,
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
			fromPackage: true,
		}),
	).rejects.toThrow(`${stylesheet}: url(./missing.png) names`);
});

test('inlines a package @import once and fails on an @import with conditions', async () => {
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
	const process = (filepath: string) =>
		new FileStylesheetProcessor({ appConfig: createConfig() }).process({
			kind: 'stylesheet',
			source: 'file',
			filepath,
			fromPackage: true,
		});

	expect(readFileSync((await process(stylesheet)).filepath!, 'utf-8')).toBe('.other {}\n\n.top {}');

	const conditional = writePackageFile('dist/print.css', "@import './style.css' print;");
	await expect(process(conditional)).rejects.toThrow('has conditions');
});
