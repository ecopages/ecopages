import { describe, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PostCssProcessor } from '../postcss-processor';
import { tailwindV3Preset } from '../presets/tailwind-v3';
import { tailwindV4Preset } from '../presets/tailwind-v4';

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
		const referencePath = path.resolve(
			__dirname,
			'../../../../../playground/kitchen-sink/src/styles/tailwind.css',
		);
		const preset = tailwindV4Preset({ referencePath });
		const css = `@import 'tailwindcss';`;

		const result = await PostCssProcessor.processStringOrBuffer(css, {
			plugins: preset.plugins ? Object.values(preset.plugins) : [],
			filePath: referencePath,
		});

		expect(result.length).toBeGreaterThan(0);
		expect(result).toContain('--tw-');
	});
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
	const originalNodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = 'production';

	try {
		const kitchenSinkTailwindPath = path.resolve(
			__dirname,
			'../../../../../playground/kitchen-sink/src/styles/tailwind.css',
		);
		const preset = tailwindV4Preset({
			referencePath: kitchenSinkTailwindPath,
		});
		const css = await readFile(kitchenSinkTailwindPath, 'utf-8');

		const result = await PostCssProcessor.processStringOrBuffer(css, {
			plugins: preset.plugins ? Object.values(preset.plugins) : [],
			filePath: kitchenSinkTailwindPath,
		});

		expect(result).toContain('.button--primary');
		expect(result).not.toContain('--primary.button');
	} finally {
		if (originalNodeEnv === undefined) {
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = originalNodeEnv;
		}
	}
});

describe('Tailwind v4 transformInput', () => {
	const referencePath = '/abs/path/src/styles/tailwind.css';

	test('should inject an absolute @reference for files using @apply', async () => {
		const preset = tailwindV4Preset({ referencePath });
		const css = `.main-title { @apply text-2xl font-bold; }`;
		const srcPath = '/abs/path/src/pages/index.css';

		const result = await preset.transformInput!(css, srcPath);

		expect(result).toContain(`@reference "${referencePath}"`);
		expect(result).toContain('@apply');
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
	const referencePath = path.resolve(
		__dirname,
		'../../../../../playground/kitchen-sink/src/styles/tailwind.css',
	);

	test('resolves @apply when the reference is injected at the src location but processed from a different (dist) location', async () => {
		const preset = tailwindV4Preset({ referencePath });
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
