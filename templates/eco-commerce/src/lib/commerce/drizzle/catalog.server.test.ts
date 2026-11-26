import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { CatalogBackend } from '../backend.ts';
import { createDrizzleCatalog } from './catalog.server.ts';
import { openTestCatalog } from './database.fixture.ts';
import { CATALOG_SIZES } from './seed/generator.ts';

const size = CATALOG_SIZES.small;

describe('drizzle catalog on the small seed', () => {
	let database: Awaited<ReturnType<typeof openTestCatalog>>;
	let catalog: CatalogBackend;

	beforeAll(async () => {
		database = await openTestCatalog();
		catalog = createDrizzleCatalog(async () => database.db);
	});

	afterAll(() => database.dispose());

	test('the store tree lists every collection, category and subcategory with counts and images', async () => {
		const tree = await catalog.getStoreTree();

		expect(tree.map((collection) => collection.handle)).toEqual(['living', 'workspace', 'kitchen']);
		expect(tree[0]?.categories.map((category) => category.handle)).toEqual(['seating', 'tables', 'lighting']);
		const subcategory = tree[0]!.categories[0]!.subcategories[0]!;
		expect(subcategory).toMatchObject({ handle: 'lounge-chairs', productCount: size.productsPerSubcategory });
		expect(subcategory.thumbnail).toMatch(/^\/images\/products\/[a-z0-9-]+$/u);
	});

	test('the static paths cover every listing level', async () => {
		const paths = await catalog.listCatalogPaths();
		const categories = size.collections * size.categoriesPerCollection;

		expect(paths.collections).toHaveLength(size.collections);
		expect(paths.categories).toHaveLength(categories);
		expect(paths.subcategories).toHaveLength(categories * size.subcategoriesPerCategory);
		expect(await catalog.listFeaturedProductHandles(2)).toHaveLength(
			categories * size.subcategoriesPerCategory * 2,
		);
	});

	test('a search treats LIKE wildcards in the term as plain text', async () => {
		expect((await catalog.listProducts({ search: '%' })).total).toBe(0);
		expect((await catalog.listProducts({ search: '_' })).total).toBe(0);
	});

	test('a search lists titles that start with the term before titles that only contain it', async () => {
		const { items } = await catalog.listProducts({ search: 'ar', pageSize: 96 });
		const startsWith = items.map((item) => item.title.toLowerCase().startsWith('ar'));

		expect(startsWith).toContain(true);
		expect(startsWith).toContain(false);
		expect(startsWith.indexOf(false)).toBe(startsWith.lastIndexOf(true) + 1);
	});

	test('a finish filter keeps the products that offer one of the finishes', async () => {
		const all = await catalog.listProducts({ subcategory: 'lounge-chairs' });
		const finish = all.facets.finishes[0]!;

		const filtered = await catalog.listProducts({ subcategory: 'lounge-chairs', finishes: [finish] });

		for (const item of filtered.items) {
			const product = await catalog.getProduct(item.handle);
			expect(product?.variants.map((variant) => variant.title)).toContain(finish);
		}
	});

	test('a listing of an unknown subcategory is empty', async () => {
		expect(await catalog.listProducts({ subcategory: 'no-such' })).toMatchObject({ total: 0, items: [] });
	});
});
