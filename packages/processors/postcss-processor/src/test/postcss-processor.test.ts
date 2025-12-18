import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import postCssSimpleVars from 'postcss-simple-vars';
import { PostCssProcessor } from '../postcss-processor';

describe('PostCssProcessor', () => {
	test('processPath should return the processed CSS', async () => {
		const filePath = path.resolve(__dirname, './css/correct.css');
		const expected = '.test{--tw-bg-opacity:1;background-color:rgb(239 68 68/var(--tw-bg-opacity,1))}';
		const result = await PostCssProcessor.processPath(filePath);
		expect(result).toEqual(expected);
	});

	test('processPath should return an empty string when an error occurs during css conversion', async () => {
		const filePath = path.resolve(__dirname, './css/error.css');
		const expected = '';
		const result = await PostCssProcessor.processPath(filePath);
		expect(result).toEqual(expected);
	});

	test('processPath should throw when the file does not exist', async () => {
		const filePath = 'fake-path.css';
		expect(PostCssProcessor.processPath(filePath)).rejects.toThrow();
	});

	test('processPath should use the custom plugins', async () => {
		const filePath = path.resolve(__dirname, './css/external-plugins.css');
		const expected = '.menu_link{background:#056ef0;width:200px}.menu{margin-top:10px;width:800px}';
		const result = await PostCssProcessor.processPath(filePath, {
			plugins: [
				PostCssProcessor.defaultPlugins['postcss-import'],
				PostCssProcessor.defaultPlugins.tailwindcss,
				PostCssProcessor.defaultPlugins['tailwindcss-nesting'],
				PostCssProcessor.defaultPlugins.autoprefixer,
				postCssSimpleVars(),
				PostCssProcessor.defaultPlugins.cssnano,
			],
		});
		expect(result).toEqual(expected);
	});

	test('processStringOrBuffer should return the processed CSS', async () => {
		const string = 'body { @apply bg-white; }';
		const expected = 'body{--tw-bg-opacity:1;background-color:rgb(255 255 255/var(--tw-bg-opacity,1))}';
		const result = await PostCssProcessor.processStringOrBuffer(string);
		expect(result).toEqual(expected);
	});

	test('processStringOrBuffer should return an empty string when an error occurs during css conversion', async () => {
		const string = 'body { @apply bg-whites; }';
		const expected = '';
		const result = await PostCssProcessor.processStringOrBuffer(string);
		expect(result).toEqual(expected);
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
			plugins: [
				PostCssProcessor.defaultPlugins['postcss-import'],
				PostCssProcessor.defaultPlugins.tailwindcss,
				PostCssProcessor.defaultPlugins['tailwindcss-nesting'],
				PostCssProcessor.defaultPlugins.autoprefixer,
				postCssSimpleVars(),
				PostCssProcessor.defaultPlugins.cssnano,
			],
		});
		expect(result).toEqual(expected);
	});

	test('processStringOrBuffer should use the transformOutput', async () => {
		const string = 'body { background: #056ef0; }';
		const expected = '@reference "../app.css";\nbody{background:#056ef0}';
		const result = await PostCssProcessor.processStringOrBuffer(string, {
			plugins: [PostCssProcessor.defaultPlugins.cssnano],
			transformOutput: (css) => {
				return `@reference "../app.css";\n${css}`;
			},
		});
		expect(result).toEqual(expected);
	});

	test('processPath should resolve @import', async () => {
		const filePath = path.resolve(__dirname, './css/import.css');
		const expected = '.base{color:red}.main{background:blue}';
		const result = await PostCssProcessor.processPath(filePath);
		expect(result).toEqual(expected);
	});

	test('processStringOrBuffer should resolve @import', async () => {
		const string = '@import "base.css"; .main { background: blue; }';
		const filePath = path.resolve(__dirname, './css/import.css');
		const expected = '.base{color:red}.main{background:blue}';
		const result = await PostCssProcessor.processStringOrBuffer(string, { filePath });
		expect(result).toEqual(expected);
	});
});
