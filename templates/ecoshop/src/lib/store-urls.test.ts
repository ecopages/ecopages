import { describe, expect, it } from 'vitest';
import { productHandleFromPath, resolveUrl } from './store-urls';

describe('productHandleFromPath', () => {
	it.each([
		['/products/field-shirt', 'field-shirt'],
		['/products/field-shirt/', 'field-shirt'],
		['/products/field-shirt?variant=1', 'field-shirt'],
		['https://shop.test/products/linen%20shirt', 'linen shirt'],
		['https://shop.test/products/field-shirt.md', 'field-shirt'],
		['/products/field-shirt/reviews', null],
		['/collections/home', null],
	])('reads %s as %s', (path, handle) => {
		expect(productHandleFromPath(path)).toBe(handle);
	});
});

describe('resolveUrl', () => {
	it('keeps an absolute URL and resolves a root-relative one against the origin', () => {
		expect(resolveUrl('https://shop.test/', '/demo/a.svg')).toBe('https://shop.test/demo/a.svg');
		expect(resolveUrl('https://shop.test', 'https://cdn.shopify.com/a.jpg')).toBe('https://cdn.shopify.com/a.jpg');
	});
});
