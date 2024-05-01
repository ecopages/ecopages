import { describe, expect, test } from 'bun:test';
import { CSS_FIXTURE_FILE, CSS_FIXTURE_FILE_ERROR } from 'fixtures/constants';
import { PostCssProcessor } from './postcss-processor';

describe('PostCssProcessor', () => {
  test('processPath should return the processed CSS', async () => {
    const path = CSS_FIXTURE_FILE;
    const expected = '.test{--tw-bg-opacity:1;background-color:rgb(239 68 68/var(--tw-bg-opacity))}';
    const result = await PostCssProcessor.processPath(path);
    expect(result).toEqual(expected);
  });

  test('processPath should return an empty string when an error occurs during css conversion', async () => {
    const path = CSS_FIXTURE_FILE_ERROR;
    const expected = '';
    const result = await PostCssProcessor.processPath(path);
    expect(result).toEqual(expected);
  });

  test('processPath should throw when the file does not exist', async () => {
    const path = 'fake-path.css';
    expect(PostCssProcessor.processPath(path)).rejects.toThrow();
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
