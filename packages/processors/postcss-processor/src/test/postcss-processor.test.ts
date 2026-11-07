import { afterEach, describe, expect, test, vi } from 'vitest';
import { Logger } from '@ecopages/logger';
import { path } from '@ecopages/file-system/path';
import postcss, { CssSyntaxError } from 'postcss';
import postCssSimpleVars from 'postcss-simple-vars';
import { PostCssProcessor } from '../postcss-processor';
import { tailwindV3Preset } from '../presets/tailwind-v3';

const noop: postcss.AcceptedPlugin = { postcssPlugin: 'noop' };

describe('PostCssProcessor', () => {
	test('processPath should return the processed CSS', async () => {
		const filePath = path.resolve(__dirname, './css/correct.css');
		const expected = '.test{--tw-bg-opacity:1;background-color:rgb(239 68 68/var(--tw-bg-opacity,1))}';
		const { plugins } = tailwindV3Preset();
		const result = await PostCssProcessor.processPath(filePath, { plugins: plugins ? Object.values(plugins) : [] });
		expect(result).toEqual(expected);
	});

	test('processPath should reject with the file, line and column when css conversion fails', async () => {
		const filePath = path.resolve(__dirname, './css/error.css');
		const { plugins } = tailwindV3Preset();
		const failure = await PostCssProcessor.processPath(filePath, {
			plugins: plugins ? Object.values(plugins) : [],
		}).catch((error: unknown) => error);

		expect(failure).toBeInstanceOf(CssSyntaxError);
		expect((failure as CssSyntaxError).file).toBe(filePath);
		expect((failure as CssSyntaxError).line).toBe(2);
		expect((failure as CssSyntaxError).column).toBe(2);
		expect((failure as CssSyntaxError).message).toContain(`${filePath}:2:2`);
	});

	test('processPath should throw when the file does not exist', async () => {
		const filePath = 'fake-path.css';
		await expect(PostCssProcessor.processPath(filePath)).rejects.toThrow();
	});

	test('processPath should use the custom plugins', async () => {
		const filePath = path.resolve(__dirname, './css/external-plugins.css');
		const expected = '.menu_link{background:#056ef0;width:200px}.menu{width:800px;margin-top:10px}';
		const result = await PostCssProcessor.processPath(filePath, {
			plugins: [...Object.values(tailwindV3Preset().plugins ?? {}), postCssSimpleVars()],
		});
		expect(result).toEqual(expected);
	});

	test('processStringOrBuffer should return the processed CSS', async () => {
		const string = 'body { @apply bg-white; }';
		const expected = 'body{--tw-bg-opacity:1;background-color:rgb(255 255 255/var(--tw-bg-opacity,1))}';
		const { plugins } = tailwindV3Preset();
		const result = await PostCssProcessor.processStringOrBuffer(string, {
			plugins: plugins ? Object.values(plugins) : [],
		});
		expect(result).toEqual(expected);
	});

	test('processStringOrBuffer should reject with the file, line and column when css conversion fails', async () => {
		const string = 'body { @apply bg-whites; }';
		const filePath = path.resolve(__dirname, './css/inline-error.css');
		const { plugins } = tailwindV3Preset();
		const failure = await PostCssProcessor.processStringOrBuffer(string, {
			filePath,
			plugins: plugins ? Object.values(plugins) : [],
		}).catch((error: unknown) => error);

		expect(failure).toBeInstanceOf(CssSyntaxError);
		expect((failure as CssSyntaxError).file).toBe(filePath);
		expect((failure as CssSyntaxError).line).toBe(1);
		expect((failure as CssSyntaxError).column).toBe(8);
	});

	test('processStringOrBuffer should reject on a syntax error', async () => {
		await expect(
			PostCssProcessor.processStringOrBuffer('.a { color: red;', {
				filePath: '/app/src/main.css',
				plugins: [noop],
			}),
		).rejects.toThrow('/app/src/main.css:1:1: Unclosed block');
	});

	test('processStringOrBufferSync should throw on a syntax error', () => {
		expect(() =>
			PostCssProcessor.processStringOrBufferSync('.a { color: red;', {
				filePath: '/app/src/main.css',
				plugins: [noop],
			}),
		).toThrow('/app/src/main.css:1:1: Unclosed block');
	});

	test('processStringOrBuffer should return an empty string when the input is empty', async () => {
		const string = '';
		const expected = '';
		const result = await PostCssProcessor.processStringOrBuffer(string);
		expect(result).toEqual(expected);
	});

	test('processStringOrBuffer should use the custom plugins', async () => {
		const string = '$blue: #056ef0; body { background: $blue; }';
		const expected = 'body{background:#056ef0}';
		const result = await PostCssProcessor.processStringOrBuffer(string, {
			plugins: [...Object.values(tailwindV3Preset().plugins ?? {}), postCssSimpleVars()],
		});
		expect(result).toEqual(expected);
	});

	test('processStringOrBuffer should use the transformOutput', async () => {
		const string = 'body { background: #056ef0; }';
		const expected = '@reference "../app.css";\nbody{background:#056ef0}';
		const { plugins } = tailwindV3Preset();
		const result = await PostCssProcessor.processStringOrBuffer(string, {
			plugins: plugins?.cssnano ? [plugins.cssnano] : [],
			transformOutput: (css) => {
				return `@reference "../app.css";\n${css}`;
			},
		});
		expect(result).toEqual(expected);
	});

	test('processPath should resolve @import', async () => {
		const filePath = path.resolve(__dirname, './css/import.css');
		const expected = '.base{color:red}.main{background:blue}';
		const { plugins } = tailwindV3Preset();
		const result = await PostCssProcessor.processPath(filePath, { plugins: plugins ? Object.values(plugins) : [] });
		expect(result).toEqual(expected);
	});

	test('processStringOrBuffer should resolve @import', async () => {
		const string = '@import "base.css"; .main { background: blue; }';
		const filePath = path.resolve(__dirname, './css/import.css');
		const expected = '.base{color:red}.main{background:blue}';
		const { plugins } = tailwindV3Preset();
		const result = await PostCssProcessor.processStringOrBuffer(string, {
			filePath,
			plugins: plugins ? Object.values(plugins) : [],
		});
		expect(result).toEqual(expected);
	});
	describe('warnings', () => {
		const warnOnWord: postcss.AcceptedPlugin = {
			postcssPlugin: 'warn-on-word',
			Once(root, { result }) {
				root.walkDecls('color', (decl) => {
					decl.warn(result, 'Prefer a token');
				});
			},
		};
		const warnSpy = () => vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined as never);

		afterEach(() => {
			vi.restoreAllMocks();
		});

		test('logs a plugin warning with its file, line and column', async () => {
			const warn = warnSpy();
			const filePath = '/app/src/warn-with-position.css';

			await PostCssProcessor.processStringOrBuffer('.a {\n  color: red;\n}', {
				filePath,
				plugins: [warnOnWord],
			});

			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn).toHaveBeenCalledWith(`warn-on-word: ${filePath}:2:3: Prefer a token`);
		});

		test('logs one warning when a stylesheet is processed in two passes', async () => {
			const warn = warnSpy();
			const options = { filePath: '/app/src/warn-two-passes.css', plugins: [warnOnWord] };

			await PostCssProcessor.processStringOrBuffer('.a { color: red; }', options);
			await PostCssProcessor.processStringOrBuffer('.a { color: red; }', options);
			PostCssProcessor.processStringOrBufferSync('.a { color: red; }', options);

			expect(warn).toHaveBeenCalledTimes(1);
		});

		test('logs the warning again after the stylesheet changes', async () => {
			const warn = warnSpy();
			const options = { filePath: '/app/src/warn-after-edit.css', plugins: [warnOnWord] };

			await PostCssProcessor.processStringOrBuffer('.a { color: red; }', options);
			await PostCssProcessor.processStringOrBuffer('.a { color: blue; }', options);

			expect(warn).toHaveBeenCalledTimes(2);
		});
	});
});
