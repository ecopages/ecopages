import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { CommerceBackend } from '../commerce/backend.ts';
import { browseCatalogAction, productDetailsAction } from './catalog-api.server.ts';
import type { BrowseJson, ProductDetailsJson } from './json.ts';
import { firstVariant, openTestBackend } from './test-backend.fixture.ts';

describe('catalog API', () => {
	let subject: Awaited<ReturnType<typeof openTestBackend>>;
	let backend: CommerceBackend;

	beforeAll(async () => {
		subject = await openTestBackend();
		backend = subject.backend;
	});

	afterAll(() => subject.dispose());

	const browse = async (params: { collection?: string; category?: string }) =>
		(await (await browseCatalogAction(backend.catalog, params)).json()) as BrowseJson;

	test('browsing without a place lists the collections and their categories', async () => {
		const body = await browse({});

		expect(body.level).toBe('store');
		expect(body.level === 'store' && body.collections.map((item) => item.url)).toEqual([
			'/collections/living',
			'/collections/workspace',
			'/collections/kitchen',
		]);
	});

	test('browsing a collection lists its categories and their subcategories', async () => {
		const body = await browse({ collection: 'living' });

		expect(body.level === 'collection' && body.categories[0]?.subcategories[0]?.url).toBe(
			'/collections/living/seating/lounge-chairs',
		);
	});

	test('browsing a category lists its subcategories with products and links', async () => {
		const body = await browse({ collection: 'living', category: 'seating' });

		expect(body.level).toBe('category');
		if (body.level !== 'category') return;
		expect(body.subcategories[0]?.name).toBe('Lounge chairs');
		expect(body.subcategories[0]?.products[0]?.url).toMatch(/^\/products\/[a-z0-9-]+$/u);
		expect(body.subcategories[0]?.products[0]?.price).toMatch(/^\$\d/u);
	});

	test('a place that does not exist answers 404 with the reason, and a category alone is a bad request', async () => {
		const missing = await browseCatalogAction(backend.catalog, { collection: 'garage' });

		expect(missing.status).toBe(404);
		expect(((await missing.json()) as { error: string }).error).toMatch(/garage/u);
		expect((await browseCatalogAction(backend.catalog, { category: 'seating' })).status).toBe(400);
	});

	test('product details carry the product, its variants and its place, without internal fields', async () => {
		const { handle } = await firstVariant(backend);

		const body = (await (await productDetailsAction(backend.catalog, handle)).json()) as ProductDetailsJson;

		expect(body).toMatchObject({ handle, url: `/products/${handle}`, category: 'Seating' });
		expect(body.variants.length).toBe(3);
		expect(body).not.toHaveProperty('priceCents');
	});

	test('details of an unknown product answer 404', async () => {
		expect((await productDetailsAction(backend.catalog, 'no-such-product')).status).toBe(404);
	});
});
