import { afterEach, describe, expect, test, vi } from 'vitest';
import { Logger } from '@ecopages/logger';
import { createPath, path } from '@ecopages/file-system/path';
import postcss, { CssSyntaxError } from 'postcss';
import postCssSimpleVars from 'postcss-simple-vars';
import postcssImport from 'postcss-import';
import {
	PostCssProcessor,
	collectContentSources,
	collectDependencies,
	matchesContentSources,
	transformWithPostcss,
} from '../postcss-processor';
import { tailwindV3Preset } from '../presets/tailwind-v3';

const noop: postcss.AcceptedPlugin = { postcssPlugin: 'noop' };

describe('PostCssProcessor', () => {
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
	test.each(["@import './base.css' layer(base);", '@import url(./base.css);', "@import './base.css' screen;"])(
		'transformWithPostcss reports the partial %s inlines as a dependency',
		async (statement) => {
			const filePath = path.resolve(__dirname, './css/import.css');

			const result = await transformWithPostcss(`${statement}\n.main { background: blue; }`, {
				filePath,
				plugins: [postcssImport()],
			});

			expect(result.css).toContain('.base');
			expect(result.dependencies).toEqual([path.resolve(__dirname, './css/base.css')]);
		},
	);

	test('transformWithPostcss leaves out the content files Tailwind reports scanning', async () => {
		const scanned = path.resolve(__dirname, './css/correct.css');
		const tailwindLike: postcss.AcceptedPlugin = {
			postcssPlugin: '@tailwindcss/postcss',
			Once(_root, { result }) {
				result.messages.push({ type: 'dependency', plugin: '@tailwindcss/postcss', file: scanned, parent: '' });
			},
		};

		const result = await transformWithPostcss("@import './base.css';\n", {
			filePath: path.resolve(__dirname, './css/import.css'),
			plugins: [postcssImport(), tailwindLike],
		});

		expect(result.dependencies).toEqual([path.resolve(__dirname, './css/base.css')]);
	});

	test('collectDependencies reports a Windows path with forward slashes, once', () => {
		const message = (file: string): postcss.Message => ({
			type: 'dependency',
			plugin: 'postcss-import',
			file,
			parent: '',
		});
		expect(
			collectDependencies(
				[message('D:\\app\\css\\base.css'), message('D:/app/css/base.css'), message('D:\\app\\css\\b.css')],
				createPath('win32'),
			),
		).toEqual(['D:/app/css/base.css', 'D:/app/css/b.css']);
	});

	test('Tailwind messages are content sources, not dependencies', () => {
		const win = createPath('win32');
		const messages: postcss.Message[] = [
			{ type: 'dependency', plugin: '@tailwindcss/postcss', file: 'D:\\app\\src\\a.tsx' },
			{ type: 'dir-dependency', plugin: '@tailwindcss/postcss', dir: 'D:\\app\\src', glob: '**/*.tsx' },
			{ type: 'dependency', plugin: 'postcss-import', file: 'D:\\app\\src\\base.css', parent: '' },
		];

		expect(collectDependencies(messages, win)).toEqual(['D:/app/src/base.css']);
		const sources = collectContentSources(messages, win);
		expect(sources).toEqual({
			files: ['D:/app/src/a.tsx'],
			directories: [{ dir: 'D:/app/src', glob: '**/*.tsx' }],
		});
		expect(matchesContentSources(sources, 'D:/app/src/x/b.tsx', win)).toBe(true);
		expect(matchesContentSources(sources, 'D:/app/src/x/b.json', win)).toBe(false);
		expect(matchesContentSources(sources, 'D:/app/pnpm-lock.yaml', win)).toBe(false);
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
