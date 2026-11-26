import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { openTestCatalog } from '../db/catalog-database.fixture.ts';
import { CATALOG_SIZES } from './generator.ts';
import {
	getCategoryPage,
	getCollectionPage,
	getProductPage,
	getProductsByIds,
	getSubcategoryPage,
	listCategoryPaths,
	listCollections,
	listCollectionPaths,
	listPrebuiltProductPaths,
	listSubcategoryPaths,
	searchProducts,
} from './queries.server.ts';

const size = CATALOG_SIZES.small;

describe('catalog queries', () => {
	let database: Awaited<ReturnType<typeof openTestCatalog>>;

	beforeAll(async () => {
		database = await openTestCatalog();
	});

	afterAll(() => database.dispose());

	test('the home page lists every collection with its categories', async () => {
		const collections = await listCollections(database.db);

		expect(collections.map((collection) => collection.slug)).toEqual(['living', 'workspace', 'kitchen']);
		expect(collections[0]?.categories.map((category) => category.slug)).toEqual(['seating', 'tables', 'lighting']);
	});

	test('a collection page lists the categories of that collection with their subcategories', async () => {
		const page = await getCollectionPage(database.db, 'workspace');

		expect(page?.collection.name).toBe('Workspace');
		expect(page?.categories.map((category) => category.slug)).toEqual(['desks', 'office-seating', 'storage']);
		expect(page?.categories[1]?.subcategories.map((subcategory) => subcategory.slug)).toEqual([
			'desk-chairs',
			'task-stools',
			'kneeling-chairs',
		]);
	});

	test('a category page lists its subcategories with a preview of their products', async () => {
		const page = await getCategoryPage(database.db, 'living', 'seating');

		expect(page?.category.name).toBe('Seating');
		expect(page?.subcategories.map((subcategory) => subcategory.slug)).toEqual([
			'lounge-chairs',
			'sofas',
			'benches',
		]);
		expect(page?.subcategories[0]?.products.length).toBeGreaterThan(0);
		expect(page?.subcategories[0]?.productCount).toBe(size.productsPerSubcategory);
	});

	test('a subcategory page lists every product of that subcategory', async () => {
		const page = await getSubcategoryPage(database.db, 'living', 'seating', 'lounge-chairs');

		expect(page?.subcategory.name).toBe('Lounge chairs');
		expect(page?.products).toHaveLength(size.productsPerSubcategory);
		expect(page?.products.every((product) => product.name.endsWith('lounge chair'))).toBe(true);
	});

	test('a product page carries its parents for the breadcrumb and related products', async () => {
		const subcategory = await getSubcategoryPage(database.db, 'living', 'seating', 'lounge-chairs');
		const slug = subcategory!.products[0]!.slug;

		const page = await getProductPage(database.db, slug);

		expect(page?.product.slug).toBe(slug);
		expect(page?.collection.slug).toBe('living');
		expect(page?.category.slug).toBe('seating');
		expect(page?.subcategory.slug).toBe('lounge-chairs');
		expect(page?.related.some((product) => product.slug === slug)).toBe(false);
		expect(page?.related).toHaveLength(size.productsPerSubcategory - 1);
	});

	test('a path that does not match the hierarchy finds nothing', async () => {
		expect(await getCollectionPage(database.db, 'garage')).toBeNull();
		expect(await getCategoryPage(database.db, 'kitchen', 'seating')).toBeNull();
		expect(await getSubcategoryPage(database.db, 'living', 'tables', 'lounge-chairs')).toBeNull();
		expect(await getProductPage(database.db, 'no-such-product')).toBeNull();
	});

	test('lists the params of every listing page and of the prebuilt product pages', async () => {
		const categories = size.collections * size.categoriesPerCollection;
		const subcategories = categories * size.subcategoriesPerCategory;

		expect(await listCollectionPaths(database.db)).toHaveLength(size.collections);
		expect(await listCategoryPaths(database.db)).toContainEqual({ collection: 'living', category: 'seating' });
		expect(await listCategoryPaths(database.db)).toHaveLength(categories);
		expect(await listSubcategoryPaths(database.db)).toHaveLength(subcategories);
		expect(await listPrebuiltProductPaths(database.db, 2)).toHaveLength(subcategories * 2);
	});

	test('search matches product names case-insensitively', async () => {
		const results = await searchProducts(database.db, 'CHAIR', 50);

		expect(results.length).toBeGreaterThan(0);
		expect(results.every((product) => product.name.toLowerCase().includes('chair'))).toBe(true);
	});

	test('search lists names that start with the query before names that only contain it', async () => {
		const results = await searchProducts(database.db, 'ar', 200);
		const startsWith = results.map((product) => product.name.toLowerCase().startsWith('ar'));

		expect(startsWith).toContain(true);
		expect(startsWith).toContain(false);
		expect(startsWith.indexOf(false)).toBe(startsWith.lastIndexOf(true) + 1);
	});

	test('search treats LIKE wildcards in the query as plain text', async () => {
		expect(await searchProducts(database.db, '%', 10)).toEqual([]);
		expect(await searchProducts(database.db, '_', 10)).toEqual([]);
	});

	test('search with a blank query finds nothing', async () => {
		expect(await searchProducts(database.db, '   ', 10)).toEqual([]);
	});

	test('looks products up by id and skips unknown ids', async () => {
		const products = await getProductsByIds(database.db, [2, 1, 999_999]);

		expect(products.map((product) => product.id).sort()).toEqual([1, 2]);
	});
});
