import { describe, expect, test } from 'vitest';
import { resolveBuildPolicy } from './build-policy.ts';

describe('resolveBuildPolicy', () => {
	test('prebuilds four products and two listing pages per subcategory by default', () => {
		expect(resolveBuildPolicy({})).toEqual({ productsPerSubcategory: 4, listingPagesPerSubcategory: 2 });
	});

	test('reads overrides and ignores values that are not positive integers', () => {
		expect(resolveBuildPolicy({ PREBUILT_PRODUCTS_PER_SUBCATEGORY: '1', PREBUILT_LISTING_PAGES: '5' })).toEqual({
			productsPerSubcategory: 1,
			listingPagesPerSubcategory: 5,
		});
		expect(resolveBuildPolicy({ PREBUILT_PRODUCTS_PER_SUBCATEGORY: '0', PREBUILT_LISTING_PAGES: 'many' })).toEqual({
			productsPerSubcategory: 4,
			listingPagesPerSubcategory: 2,
		});
	});
});
