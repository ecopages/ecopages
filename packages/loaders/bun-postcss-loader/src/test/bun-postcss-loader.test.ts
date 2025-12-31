import { describe, expect, test } from 'bun:test';
import '../bun-postcss-loader';

describe('bun-postcss-loader', () => {
	test('processPath should return the processed CSS', async () => {
		const { default: correct } = await import('./css/correct.css');
		const expected = '.test{--tw-bg-opacity:1;background-color:rgb(239 68 68/var(--tw-bg-opacity,1))}';
		expect(correct).toEqual(expected);
	});

	test('processPath should return an empty string when an error occurs during css conversion', async () => {
		const { default: error } = await import('./css/error.css');
		const expected = '';
		expect(error).toEqual(expected);
	});
});
