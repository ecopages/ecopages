import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { bunInlineCssPlugin } from '../bun-inline-css-plugin.ts';

const TMP_DIR = path.join(__dirname, 'dist-test');

const cleanup = () => {
	if (fs.existsSync(TMP_DIR)) {
		fs.rmSync(TMP_DIR, { recursive: true });
	}
};

afterEach(cleanup);

describe('bunInlineCssPlugin', () => {
	test('should return the css file content as-is with default options', async () => {
		const outdir = path.join(TMP_DIR, 'dist-1');
		const filePath = path.resolve(__dirname, './correct.ts');
		const cssPath = path.resolve(__dirname, './css/correct.css');
		const expected = fs.readFileSync(cssPath, 'utf-8');

		const build = await Bun.build({
			entrypoints: [filePath],
			outdir,
			root: __dirname,
			plugins: [bunInlineCssPlugin({})],
		});

		expect(build.success).toBe(true);

		const processedFile = build.outputs[0].path;
		const bundle = await import(processedFile);
		const cssModule = await bundle.default;

		expect(cssModule.default).toEqual(expected);
	});

	test('should apply custom transformations', async () => {
		const outdir = path.join(TMP_DIR, 'dist-2');
		const filePath = path.resolve(__dirname, './correct.ts');
		const cssPath = path.resolve(__dirname, './css/correct.css');
		const expected = fs.readFileSync(cssPath, 'utf-8').replace('bg-red-500', 'bg-blue-500');

		const build = await Bun.build({
			entrypoints: [filePath],
			outdir,
			plugins: [
				bunInlineCssPlugin({
					transform: async (text) => text.toString().replace('bg-red-500', 'bg-blue-500'),
				}),
			],
		});

		expect(build.success).toBe(true);

		const processedFile = build.outputs[0].path;
		const bundle = await import(processedFile);
		const cssModule = await bundle.default;

		expect(cssModule.default).toEqual(expected);
	});

	test('should return content without transformation on files with errors if no validator is present (default behavior)', async () => {
		const outdir = path.join(TMP_DIR, 'dist-3');
		const filePath = path.resolve(__dirname, './with-error.ts');
		const cssPath = path.resolve(__dirname, './css/with-error.css');
		const expected = fs.readFileSync(cssPath, 'utf-8');

		const build = await Bun.build({
			entrypoints: [filePath],
			outdir,
			root: __dirname,
			plugins: [bunInlineCssPlugin({})],
		});

		expect(build.success).toBe(true);

		const processedFile = build.outputs[0].path;
		const bundle = await import(processedFile);
		const cssModule = await bundle.default;

		expect(cssModule.default).toEqual(expected);
	});
});
