import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { openTestCatalog } from '../db/catalog-database.fixture.ts';
import {
	browseCatalogAction,
	productDetailsAction,
	type BrowseResult,
	type ProductDetails,
} from './catalog-api.server.ts';

describe('catalog API', () => {
	let database: Awaited<ReturnType<typeof openTestCatalog>>;

	beforeAll(async () => {
		database = await openTestCatalog();
	});

	afterAll(() => database.dispose());

	test('browsing without a place lists the collections and their categories', async () => {
		const body = (await (await browseCatalogAction(database.db, {})).json()) as BrowseResult;

		expect(body.level).toBe('store');
		expect(body.level === 'store' && body.collections.map((item) => item.url)).toEqual([
			'/collections/living',
			'/collections/workspace',
			'/collections/kitchen',
		]);
	});

	test('browsing a collection lists its categories and their subcategories', async () => {
		const body = (await (await browseCatalogAction(database.db, { collection: 'living' })).json()) as BrowseResult;

		expect(body.level).toBe('collection');
		if (body.level !== 'collection') return;
		expect(body.collection.name).toBe('Living');
		expect(body.categories[0]?.url).toBe('/collections/living/seating');
		expect(body.categories[0]?.subcategories[0]?.url).toBe('/collections/living/seating/lounge-chairs');
	});

	test('browsing a category lists its subcategories with products and links', async () => {
		const response = await browseCatalogAction(database.db, { collection: 'living', category: 'seating' });
		const body = (await response.json()) as BrowseResult;

		expect(body.level).toBe('category');
		if (body.level !== 'category') return;
		expect(body.subcategories[0]?.name).toBe('Lounge chairs');
		expect(body.subcategories[0]?.products[0]?.url).toMatch(/^\/products\/[a-z0-9-]+$/u);
		expect(body.subcategories[0]?.products[0]?.price).toMatch(/^\$\d/u);
	});

	test('browsing a place that does not exist answers 404 with the reason', async () => {
		const response = await browseCatalogAction(database.db, { collection: 'garage' });

		expect(response.status).toBe(404);
		expect(((await response.json()) as { error: string }).error).toMatch(/garage/u);
	});

	test('a category without its collection is a bad request', async () => {
		expect((await browseCatalogAction(database.db, { category: 'seating' })).status).toBe(400);
	});

	test('product details carry the product, its place and its link, without internal fields', async () => {
		const browse = (await (
			await browseCatalogAction(database.db, { collection: 'living', category: 'seating' })
		).json()) as BrowseResult;
		const slug = browse.level === 'category' ? browse.subcategories[0]!.products[0]!.product : '';

		const response = await productDetailsAction(database.db, slug);
		const body = (await response.json()) as ProductDetails;

		expect(body).toMatchObject({ product: slug, url: `/products/${slug}`, category: 'Seating' });
		expect(body.description.length).toBeGreaterThan(0);
		expect(body).not.toHaveProperty('priceCents');
	});

	test('details of an unknown product answer 404', async () => {
		expect((await productDetailsAction(database.db, 'no-such-product')).status).toBe(404);
	});
});
