import { describe, expect, it } from 'vitest';
import { parseSearchParams } from './parse-search-params.ts';

describe('parseSearchParams', () => {
	it('keeps a single value as a string and repeated keys as ordered arrays', () => {
		const query = parseSearchParams(new URLSearchParams('q=a&tag=one&tag=two&tag=three'));

		expect(query).toEqual({ q: 'a', tag: ['one', 'two', 'three'] });
	});

	it('returns an empty object for an empty query string', () => {
		expect(parseSearchParams(new URLSearchParams())).toEqual({});
	});
});
