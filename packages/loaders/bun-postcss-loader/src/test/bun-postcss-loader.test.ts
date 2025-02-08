import { describe, expect, test } from 'bun:test';
import correct from './css/correct.css';
import error from './css/error.css';

describe('bun-postcss-loader', () => {
  test('processPath should return the processed CSS', async () => {
    const expected = '.test{--tw-bg-opacity:1;background-color:rgb(239 68 68/var(--tw-bg-opacity,1))}';
    expect(correct).toEqual(expected);
  });

  test('processPath should return an empty string when an error occurs during css conversion', async () => {
    const expected = '';
    expect(error).toEqual(expected);
  });
});
