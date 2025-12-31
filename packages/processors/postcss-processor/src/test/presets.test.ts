import { describe, expect, test } from 'bun:test';
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
			filePath: path.resolve(import.meta.dir, 'style.css'),
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
			}
		`;

		const result = await PostCssProcessor.processStringOrBuffer(cssWithNesting, {
			plugins: plugins ? Object.values(plugins) : [],
			filePath: path.resolve(import.meta.dir, 'style.css'),
		});

		expect(result).toContain('.parent .child{color:blue}');
		expect(result).toContain('.parent__element{color:green}');
	});

	test('Tailwind v4 preset should add vendor prefixes (via Lightning CSS)', async () => {
		const preset = tailwindV4Preset({
			referencePath: path.resolve(import.meta.dir, '../fixtures/tailwind.css'),
		});

		const result = await PostCssProcessor.processStringOrBuffer(cssToPrefix, {
			plugins: preset.plugins ? Object.values(preset.plugins) : [],
			filePath: path.resolve(import.meta.dir, 'style.css'),
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
			referencePath: path.resolve(import.meta.dir, '../fixtures/tailwind.css'),
		});

		/**
		 * Provide a filePath that allows resolving sibling files (like base.css in existing tests/css dir)
		 * We'll leverage the existing test css files
		 */
		const filePath = path.resolve(import.meta.dir, 'css/import.css');

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
		referencePath: path.resolve(import.meta.dir, '../fixtures/tailwind.css'),
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
			}
		`;

	const result = await PostCssProcessor.processStringOrBuffer(cssWithNesting, {
		plugins: preset.plugins ? Object.values(preset.plugins) : [],
		filePath: path.resolve(import.meta.dir, 'style.css'),
	});

	expect(result).toContain('.parent .child{color:blue}');
	expect(result).toContain('.parent__element{color:green}');
});
