import { describe, expect, test } from 'vitest';
import { productCacheTags } from './cache-tags.ts';

describe('productCacheTags', () => {
	test('tags a product page with its own tag and the tags that drop every product page', () => {
		expect(productCacheTags('oak-chair')).toEqual(['catalog', 'products', 'product:oak-chair']);
	});

	test('gives two products different own tags', () => {
		expect(productCacheTags('a')).not.toContain('product:b');
		expect(productCacheTags('b')).not.toContain('product:a');
	});
});
