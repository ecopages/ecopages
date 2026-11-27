import { describe, expect, it } from 'vitest';
import { groupRepeatedKeys, parseSearchParams } from './parse-search-params.ts';

describe('parseSearchParams', () => {
	it('keeps a single value as a string and repeated keys as ordered arrays', () => {
		const query = parseSearchParams(new URLSearchParams('q=a&tag=one&tag=two&tag=three'));

		expect(query).toEqual({ q: 'a', tag: ['one', 'two', 'three'] });
	});

	it('groups form data and keeps a key named __proto__ as an own key', () => {
		const form = new FormData();
		form.append('__proto__', 'x');
		form.append('tag', 'a');
		form.append('tag', 'b');
		const grouped = groupRepeatedKeys(form);

		expect(grouped.tag).toEqual(['a', 'b']);
		expect(Object.hasOwn(grouped, '__proto__')).toBe(true);
		expect(Object.getPrototypeOf(grouped)).toBe(Object.prototype);
	});

	it('returns an empty object for an empty query string', () => {
		expect(parseSearchParams(new URLSearchParams())).toEqual({});
	});
});
