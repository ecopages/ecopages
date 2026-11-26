import { describe, expect, test } from 'vitest';
import { CATALOG_SIZES, generateCatalog, resolveCatalogSize } from './generator.ts';

describe('generateCatalog', () => {
	test('returns the same catalog for the same size', () => {
		expect(generateCatalog(CATALOG_SIZES.small)).toEqual(generateCatalog(CATALOG_SIZES.small));
	});

	test('creates as many rows at each level as the size asks for', () => {
		const size = CATALOG_SIZES.small;
		const catalog = generateCatalog(size);
		const categories = size.collections * size.categoriesPerCollection;
		const subcategories = categories * size.subcategoriesPerCategory;

		expect(catalog.collections).toHaveLength(size.collections);
		expect(catalog.categories).toHaveLength(categories);
		expect(catalog.subcategories).toHaveLength(subcategories);
		expect(catalog.products).toHaveLength(subcategories * size.productsPerSubcategory);
	});

	test('links every row to an existing parent', () => {
		const catalog = generateCatalog(CATALOG_SIZES.medium);
		const collectionIds = new Set(catalog.collections.map((row) => row.id));
		const categoryIds = new Set(catalog.categories.map((row) => row.id));
		const subcategoryIds = new Set(catalog.subcategories.map((row) => row.id));

		expect(catalog.categories.every((row) => collectionIds.has(row.collectionId))).toBe(true);
		expect(catalog.subcategories.every((row) => categoryIds.has(row.categoryId))).toBe(true);
		expect(catalog.products.every((row) => subcategoryIds.has(row.subcategoryId))).toBe(true);
	});

	test('gives every row a unique, URL-safe slug', () => {
		const catalog = generateCatalog(CATALOG_SIZES.large);
		const groups = [catalog.collections, catalog.categories, catalog.subcategories, catalog.products];

		for (const rows of groups) {
			const slugs = rows.map((row) => row.slug);
			expect(new Set(slugs).size).toBe(slugs.length);
			expect(slugs.every((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug))).toBe(true);
		}
	});

	test('includes chairs in the default catalog', () => {
		const catalog = generateCatalog(resolveCatalogSize(undefined).size);

		expect(catalog.products.some((product) => product.name.toLowerCase().includes('chair'))).toBe(true);
	});

	test('prices every product in whole cents above zero', () => {
		const catalog = generateCatalog(CATALOG_SIZES.small);

		expect(
			catalog.products.every((product) => Number.isInteger(product.priceCents) && product.priceCents > 0),
		).toBe(true);
	});
});

describe('resolveCatalogSize', () => {
	test('defaults to the small preset', () => {
		expect(resolveCatalogSize(undefined)).toEqual({ name: 'small', size: CATALOG_SIZES.small });
		expect(resolveCatalogSize('')).toEqual({ name: 'small', size: CATALOG_SIZES.small });
	});

	test('reads a preset name in any case', () => {
		expect(resolveCatalogSize('Large')).toEqual({ name: 'large', size: CATALOG_SIZES.large });
	});

	test('rejects an unknown preset with the accepted names', () => {
		expect(() => resolveCatalogSize('huge')).toThrow(/small, medium, large/u);
		expect(() => resolveCatalogSize('constructor')).toThrow(/small, medium, large/u);
	});
});
