import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import postCssSimpleVars from 'postcss-simple-vars';
import { PostCssProcessor } from '../postcss-processor';

describe('PostCssProcessor', () => {
  test('processPath should return the processed CSS', async () => {
    const filePath = path.resolve(__dirname, './css/correct.css');
    const expected =
      '/*! tailwindcss v4.1.0 | MIT License | https://tailwindcss.com */\n.test {\n  background-color: var(--color-red-500, oklch(63.7% 0.237 25.331));\n}\n';
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
    const expected =
      '/*! tailwindcss v4.1.0 | MIT License | https://tailwindcss.com */\n.menu_link {\n  background: #056ef0;\n  width: 200px;\n}\n.menu {\n  width: calc(4 * 200px);\n  margin-top: 10px;\n}\n';
    const result = await PostCssProcessor.processPath(filePath, {
      plugins: [PostCssProcessor.defaultPlugins['@tailwindcss/postcss'], postCssSimpleVars()],
    });
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
    const expected = 'body { background: #056ef0; }';
    const result = await PostCssProcessor.processStringOrBuffer(string, {
      plugins: [postCssSimpleVars(), PostCssProcessor.defaultPlugins['@tailwindcss/postcss']],
    });
    expect(result).toEqual(expected);
  });
});
