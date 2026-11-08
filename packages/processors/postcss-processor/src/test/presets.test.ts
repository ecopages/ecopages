import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { path } from '@ecopages/file-system/path';
import postcss from 'postcss';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import { PostCssProcessorPlugin } from '../plugin';
import { collectDependencies, PostCssProcessor } from '../postcss-processor';
import { tailwindV3Preset } from '../presets/tailwind-v3';
import { tailwindV4Preset } from '../presets/tailwind-v4';

const tailwindV4PackageDir = path.dirname(
	createRequire(import.meta.resolve('@tailwindcss/postcss')).resolve('tailwindcss/package.json'),
);

let tailwindAppDir: string;
let tailwindReferencePath: string;
let bemApplyPath: string;
let outputDir: string;

/**
 * @remarks
 * The Tailwind v4 preset resolves `@import 'tailwindcss'` from the nearest
 * `package.json` above the reference file. This package only has Tailwind v3
 * installed, so the tests run in a temporary app whose `node_modules` links
 * to the v4 package the preset itself uses. `outputDir` has no `node_modules`
 * above it, so a stylesheet processed from there finds Tailwind only through
 * the app root.
 */
beforeAll(() => {
	tailwindAppDir = path.fromNative(mkdtempSync(path.join(tmpdir(), 'eco-tailwind-app-')));
	tailwindReferencePath = path.join(tailwindAppDir, 'src/styles/tailwind.css');
	bemApplyPath = path.join(tailwindAppDir, 'src/styles/bem-apply.css');
	outputDir = path.fromNative(mkdtempSync(path.join(tmpdir(), 'eco-tailwind-out-')));
	mkdirSync(path.join(tailwindAppDir, 'node_modules'), { recursive: true });
	mkdirSync(path.dirname(tailwindReferencePath), { recursive: true });
	symlinkSync(tailwindV4PackageDir, path.join(tailwindAppDir, 'node_modules/tailwindcss'), 'dir');
	writeFileSync(path.join(tailwindAppDir, 'package.json'), JSON.stringify({ name: 'tailwind-app', private: true }));
	writeFileSync(tailwindReferencePath, `@import 'tailwindcss' source(none);\n`);
	writeFileSync(
		bemApplyPath,
		[
			`@import 'tailwindcss' source(none);`,
			'',
			'@layer components {',
			'	.button {',
			'		@apply border px-3 py-1.5;',
			'',
			'		&--primary {',
			'			@apply bg-sky-600 font-semibold text-white hover:bg-sky-500;',
			'		}',
			'	}',
			'}',
			'',
		].join('\n'),
	);
});

afterAll(() => {
	rmSync(tailwindAppDir, { recursive: true, force: true });
	rmSync(outputDir, { recursive: true, force: true });
});

describe('Presets Verification', () => {
	const cssToPrefix = `
		.test-prefix {
			user-select: none;
			backdrop-filter: blur(10px);
			appearance: none;
		}
	`;

	const cssWithImport = `
		@import "base.css";
		.main { background: blue; }
	`;

	test('Tailwind v3 preset should add vendor prefixes', async () => {
		const { plugins } = tailwindV3Preset();
		/**
		 * Disable cssnano for readable output logic check, or just check content calls
		 * By default preset includes cssnano.
		 */

		const result = await PostCssProcessor.processStringOrBuffer(cssToPrefix, {
			plugins: plugins ? Object.values(plugins) : [],
			filePath: path.resolve(__dirname, 'style.css'),
		});

		/**
		 * cssnano will minify, so we check minified output
		 * user-select: none -> -webkit-user-select:none;user-select:none
		 * backdrop-filter: blur(10px) -> -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)
		 * appearance: none -> -webkit-appearance:none;-moz-appearance:none;appearance:none
		 */

		expect(result).toContain('-webkit-user-select:none');
		expect(result).toContain('user-select:none');

		expect(result).toContain('-webkit-backdrop-filter:blur(10px)');
		expect(result).toContain('backdrop-filter:blur(10px)');

		expect(result).toContain('appearance:none');
	});

	test('Tailwind v3 preset should support nesting', async () => {
		const { plugins } = tailwindV3Preset();
		const cssWithNesting = `
			.parent {
				& .child { color: blue; }
				&__element { color: green; }
				&--active { color: red; }
			}
		`;

		const result = await PostCssProcessor.processStringOrBuffer(cssWithNesting, {
			plugins: plugins ? Object.values(plugins) : [],
			filePath: path.resolve(__dirname, 'style.css'),
		});

		expect(result).toContain('.parent .child{color:blue}');
		expect(result).toContain('.parent__element{color:green}');
		expect(result).toContain('.parent--active{color:red}');
	});

	test('Tailwind v4 preset should add vendor prefixes (via Lightning CSS)', async () => {
		const preset = tailwindV4Preset({
			referencePath: path.resolve(__dirname, '../fixtures/tailwind.css'),
		});

		expect(preset.dependencyEntryPaths).toEqual([path.resolve(__dirname, '../fixtures/tailwind.css')]);

		const result = await PostCssProcessor.processStringOrBuffer(cssToPrefix, {
			plugins: preset.plugins ? Object.values(preset.plugins) : [],
			filePath: path.resolve(__dirname, 'style.css'),
		});

		/**
		 * Lightning CSS used by @tailwindcss/postcss should verify this
		 * Note: The specific prefixes might depend on the browser targets configured in package.json or defaults
		 */

		expect(result).toContain('-webkit-user-select:none');
		expect(result).toContain('user-select:none');

		expect(result).toContain('-webkit-backdrop-filter:blur(10px)');
		expect(result).toContain('backdrop-filter:blur(10px)');

		expect(result).toContain('appearance:none');
	});

	test('Tailwind v4 preset should resolve @import', async () => {
		const preset = tailwindV4Preset({
			referencePath: path.resolve(__dirname, '../fixtures/tailwind.css'),
		});

		/**
		 * Provide a filePath that allows resolving sibling files (like base.css in existing tests/css dir)
		 * We'll leverage the existing test css files
		 */
		const filePath = path.resolve(__dirname, 'css/import.css');

		const result = await PostCssProcessor.processStringOrBuffer(cssWithImport, {
			plugins: preset.plugins ? Object.values(preset.plugins) : [],
			filePath,
		});

		/**
		 * Expect content from base.css (.base { color: red }) + main css content
		 * Minified output expected
		 */
		expect(result).toContain('.base{color:red}');
		expect(result).toContain('.main{background:blue}');
	});

	test('Tailwind v4 preset should resolve bare module @import from the app package root', async () => {
		const preset = tailwindV4Preset({ referencePath: tailwindReferencePath });
		const css = `@import 'tailwindcss' source(none);`;

		const result = await PostCssProcessor.processStringOrBuffer(css, {
			plugins: preset.plugins ? Object.values(preset.plugins) : [],
			filePath: path.join(outputDir, 'page.css'),
		});

		expect(result).toContain('--default-font-family');
		expect(result).toContain('box-sizing:border-box');
	}, 30_000);
});

test('Tailwind v4 preset should support nesting', async () => {
	const preset = tailwindV4Preset({
		referencePath: path.resolve(__dirname, 'css/tailwind-reference.css'),
	});

	const cssWithNesting = `
			.parent {
				color: red;
				& .child {
					color: blue;
				}
				&__element {
					color: green;
				}
				&--active {
					color: black;
				}
			}
		`;

	const result = await PostCssProcessor.processStringOrBuffer(cssWithNesting, {
		plugins: preset.plugins ? Object.values(preset.plugins) : [],
		filePath: path.resolve(__dirname, 'style.css'),
	});

	expect(result).toContain('.parent .child{color:blue}');
	expect(result).toContain('.parent__element{color:green}');
	expect(result).toContain('.parent--active{color:#000}');
});

test('Tailwind v4 preset should expand BEM modifiers inside @layer blocks', async () => {
	const preset = tailwindV4Preset({
		referencePath: path.resolve(__dirname, 'css/tailwind-reference.css'),
	});

	const cssWithLayeredBem = `
		@layer components {
			.button {
				&--primary {
					color: blue;
				}
			}
		}
	`;

	const result = await PostCssProcessor.processStringOrBuffer(cssWithLayeredBem, {
		plugins: preset.plugins ? Object.values(preset.plugins) : [],
		filePath: path.resolve(__dirname, 'style.css'),
	});

	expect(result).toContain('.button--primary{color:blue}');
	expect(result).not.toContain('--primary.button');
});

test('Tailwind v4 preset should preserve nested BEM selectors with @apply in production', async () => {
	vi.stubEnv('NODE_ENV', 'production');

	const preset = tailwindV4Preset({
		referencePath: bemApplyPath,
	});
	const css = await readFile(bemApplyPath, 'utf-8');

	const result = await PostCssProcessor.processStringOrBuffer(css, {
		plugins: preset.plugins ? Object.values(preset.plugins) : [],
		filePath: bemApplyPath,
	});

	expect(result).toContain('.button--primary');
	expect(result).not.toContain('--primary.button');
}, 30_000);

describe('Tailwind v4 transformInput', () => {
	const referencePath = path.resolve('/abs/path/src/styles/tailwind.css');

	test('should inject an absolute @reference for files using @apply', async () => {
		const preset = tailwindV4Preset({ referencePath });
		const css = `.main-title { @apply text-2xl font-bold; }`;
		const srcPath = '/abs/path/src/pages/index.css';

		const result = await preset.transformInput!(css, srcPath);

		expect(result).toContain(`@reference "${referencePath}"`);
		expect(result).toContain('@apply');
	});

	test('should place @reference after the leading @charset, @layer and @import statements', async () => {
		const preset = tailwindV4Preset({ referencePath });
		const css = `@charset "UTF-8";\n@layer base, theme;\n@import './a.css';\n@import './b.css';\n.x { @apply flex; }`;

		const result = await preset.transformInput!(css, '/abs/path/src/pages/index.css');

		expect(result).toBe(
			`@charset "UTF-8";\n@layer base, theme;\n@import './a.css';\n@import './b.css';\n@reference "${referencePath}";\n.x { @apply flex; }`,
		);
	});

	test('should place @reference after the imports of a stylesheet that starts with a byte order mark', async () => {
		const preset = tailwindV4Preset({ referencePath });
		const css = `\uFEFF@import './a.css';\n.x { @apply flex; }`;

		const result = await preset.transformInput!(css, '/abs/path/src/pages/index.css');

		expect(result).toBe(`\uFEFF@import './a.css';\n@reference "${referencePath}";\n.x { @apply flex; }`);
	});

	test('should inject the same absolute @reference regardless of importing file location', async () => {
		const preset = tailwindV4Preset({ referencePath });
		const css = `.main-title { @apply text-2xl font-bold; }`;

		const fromSrc = await preset.transformInput!(css, '/abs/path/src/pages/index.css');
		const fromDistBundle = await preset.transformInput!(css, '/abs/path/dist/styles/page-bundle.css');

		expect(fromSrc).toContain(`@reference "${referencePath}"`);
		expect(fromDistBundle).toContain(`@reference "${referencePath}"`);
		expect(fromSrc).toBe(fromDistBundle);
	});

	test('should return unchanged content for files that already have @reference', async () => {
		const preset = tailwindV4Preset({ referencePath });
		const css = `@reference "${referencePath}";\n\n.main-title { @apply text-2xl font-bold; }`;
		const srcPath = '/abs/path/src/pages/index.css';

		const result = await preset.transformInput!(css, srcPath);

		expect(result).toBe(css);
	});

	test('should not inject duplicate @reference on a second pass', async () => {
		const preset = tailwindV4Preset({ referencePath });
		const css = `.main-title { @apply text-2xl font-bold; }`;
		const srcPath = '/abs/path/src/pages/index.css';

		const firstPass = await preset.transformInput!(css, srcPath);
		const secondPass = await preset.transformInput!(firstPass, srcPath);

		expect(secondPass).toBe(firstPass);
		const referenceCount = (secondPass.match(/@reference/g) || []).length;
		expect(referenceCount).toBe(1);
	});

	test('should return unchanged content for the reference file itself', async () => {
		const preset = tailwindV4Preset({ referencePath });
		const css = `@import "tailwindcss";`;

		const result = await preset.transformInput!(css, referencePath);

		expect(result).toBe(css);
	});

	test('should replace @import tailwindcss with an absolute referencePath import', async () => {
		const preset = tailwindV4Preset({ referencePath });
		const css = `@import 'tailwindcss';\n\n.main { color: red; }`;
		const srcPath = '/abs/path/src/pages/index.css';

		const result = await preset.transformInput!(css, srcPath);

		expect(result).toContain(`@import '${referencePath}'`);
		expect(result).not.toContain("@import 'tailwindcss'");
	});
});

describe('Tailwind v4 preset @apply resolution (regression)', () => {
	test('resolves @apply when the reference is injected at the src location but processed from a different (dist) location', async () => {
		const preset = tailwindV4Preset({ referencePath: tailwindReferencePath });
		const raw = `.main-title { @apply text-2xl font-bold; }`;

		const srcPath = path.resolve(__dirname, 'pages/index.css');
		const transformed = await preset.transformInput!(raw, srcPath);

		const distPath = path.resolve(__dirname, '../../dist/styles/page-bundle.css');
		const result = await PostCssProcessor.processStringOrBuffer(transformed, {
			plugins: preset.plugins ? Object.values(preset.plugins) : [],
			filePath: distPath,
		});

		expect(result.length).toBeGreaterThan(0);
		expect(result).toContain('font-size');
		expect(result).toContain('.main-title');
	});
});

describe('Tailwind v4 preset with @import and @apply together', () => {
	test('keeps the partials of a stylesheet that uses @apply and reports them as dependencies', async () => {
		const pagesDir = path.join(tailwindAppDir, 'src/pages');
		const partialPath = path.join(pagesDir, 'part.css');
		const pagePath = path.join(pagesDir, 'a.css');
		mkdirSync(pagesDir, { recursive: true });
		writeFileSync(partialPath, '.from-partial { color: red; }\n');
		const preset = tailwindV4Preset({ referencePath: tailwindReferencePath });

		const input = await preset.transformInput!(
			`@charset "UTF-8";\n@import './part.css';\n.x { @apply flex; }\n`,
			pagePath,
		);
		const result = await postcss(Object.values(preset.plugins!)).process(input, { from: pagePath });

		expect(result.css).toContain('.from-partial');
		expect(result.css).toContain('display:flex');
		expect(collectDependencies(result.messages)).toContain(path.fromNative(realpathSync(partialPath)));
		expect(result.warnings().map((warning) => warning.text)).toEqual([]);
	}, 30_000);
});

describe('Tailwind v4 preset invalidation by content sources', () => {
	let entryPath: string;
	let pagesDir: string;
	let plugin: PostCssProcessorPlugin;

	let appDir: string;

	/** Tailwind reports real paths, so the app is addressed by its real path as well. */
	beforeAll(async () => {
		appDir = path.fromNative(realpathSync(tailwindAppDir));
		entryPath = path.join(appDir, 'src/styles/scan.css');
		pagesDir = path.join(appDir, 'src/pages');
		mkdirSync(path.join(appDir, 'src/data'), { recursive: true });
		mkdirSync(pagesDir, { recursive: true });
		writeFileSync(entryPath, `@import 'tailwindcss' source('../pages');\n`);
		writeFileSync(path.join(pagesDir, 'home.tsx'), `export const x = 'flex';\n`);
		plugin = new PostCssProcessorPlugin({ options: tailwindV4Preset({ referencePath: entryPath }) });
		plugin.setContext(await finalizeEcoPagesConfig({ rootDir: appDir, srcDir: 'src', distDir: 'dist' }));
	});

	test('a json or lockfile save outside the scanned directory rebuilds nothing, and a template save adds its classes', async () => {
		const entry = await readFile(entryPath, 'utf-8');
		const first = await plugin.transformStylesheet(entry, entryPath);
		expect(first.css).toContain('display:flex');
		expect(first.css).not.toContain('text-decoration-line:underline');

		expect(
			plugin.invalidateStylesheets([path.join(appDir, 'src/data/nav.json'), path.join(appDir, 'pnpm-lock.yaml')]),
		).toEqual([]);

		writeFileSync(path.join(pagesDir, 'home.tsx'), `export const x = 'flex underline';\n`);
		const stale = plugin.invalidateStylesheets([path.join(pagesDir, 'home.tsx')]);
		expect(stale).toEqual([entryPath]);

		const second = await plugin.transformStylesheet(entry, entryPath);
		expect(second.css).toContain('text-decoration-line:underline');
	}, 30_000);

	test.each([
		['Tailwind v3', () => tailwindV3Preset()],
		['Tailwind v4', () => tailwindV4Preset({ referencePath: path.resolve(__dirname, '../fixtures/tailwind.css') })],
	])('%s preset should leave relative color channel math alone without warnings', async (_name, createPreset) => {
		const preset = createPreset();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		try {
			const result = await PostCssProcessor.processStringOrBuffer(
				'.tint { color: oklch(from var(--accent) l calc(c * 0.29) h); }',
				{
					plugins: preset.plugins ? Object.values(preset.plugins) : [],
					filePath: path.resolve(__dirname, 'style.css'),
				},
			);

			expect(result).toMatch(/oklch\(from var\(--accent\) l calc\((c \* \.29|\.29 \* c)\) h\)/);
			expect(warn).not.toHaveBeenCalled();
		} finally {
			warn.mockRestore();
		}
	});
});
