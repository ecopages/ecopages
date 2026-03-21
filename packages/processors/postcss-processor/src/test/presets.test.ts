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
