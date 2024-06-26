import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { PostCssProcessor } from '../postcss-processor';

describe('PostCssProcessor', () => {
  test('processPath should return the processed CSS', async () => {
    const filePath = path.resolve(__dirname, './css/correct.css');
    const expected = '.test{--tw-bg-opacity:1;background-color:rgb(239 68 68/var(--tw-bg-opacity))}';
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

  test('processString should return the processed CSS', async () => {
    const string = 'body { @apply bg-white; }';
    const expected = 'body{--tw-bg-opacity:1;background-color:rgb(255 255 255/var(--tw-bg-opacity))}';
    const result = await PostCssProcessor.processString(string);
    expect(result).toEqual(expected);
  });

  test('processString should return an empty string when an error occurs during css conversion', async () => {
    const string = 'body { @apply bg-whites; }';
    const expected = '';
    const result = await PostCssProcessor.processString(string);
    expect(result).toEqual(expected);
  });
});
