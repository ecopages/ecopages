import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { CatalogBackend } from '../commerce/backend.ts';
import type { CatalogPaths } from '../commerce/types.ts';
import { LISTING_PAGE_SIZE, listListingPagePaths, loadSubcategoryPage } from './subcategory-page.server.ts';
import { openTestBackend } from './test-backend.fixture.ts';

describe('loadSubcategoryPage', () => {
	let subject: Awaited<ReturnType<typeof openTestBackend>>;
	let params: { collection: string; category: string; subcategory: string };

	beforeAll(async () => {
		subject = await openTestBackend();
		const [collection] = await subject.backend.catalog.getStoreTree();
		const category = collection!.categories[0]!;
		params = {
			collection: collection!.handle,
			category: category.handle,
			subcategory: category.subcategories[0]!.handle,
		};
	});

	afterAll(() => subject.dispose());

	test('loads the first page with the subcategory as the filter scope', async () => {
		const page = await loadSubcategoryPage(subject.backend.catalog, params, 1);

		expect(page.results.items.length).toBeGreaterThan(0);
		expect(page.filters.in).toBe(params.subcategory);
	});

	test('a page past the last one and an unknown subcategory are 404s', async () => {
		await expect(loadSubcategoryPage(subject.backend.catalog, params, 2)).rejects.toMatchObject({ status: 404 });
		await expect(
			loadSubcategoryPage(subject.backend.catalog, { ...params, subcategory: 'no-such' }, 1),
		).rejects.toMatchObject({ status: 404 });
	});
});

describe('listListingPagePaths', () => {
	function catalogWith(counts: number[]): Pick<CatalogBackend, 'listCatalogPaths'> {
		const paths: CatalogPaths = {
			collections: [],
			categories: [],
			subcategories: counts.map((productCount, index) => ({
				collection: 'living',
				category: 'seating',
				subcategory: `sub-${index}`,
				productCount,
			})),
		};
		return { listCatalogPaths: async () => paths };
	}

	test('lists the pages after the first, up to the policy, and none for a single-page subcategory', async () => {
		const catalog = catalogWith([LISTING_PAGE_SIZE, LISTING_PAGE_SIZE * 2 + 1, LISTING_PAGE_SIZE * 10]);

		const paths = await listListingPagePaths(catalog, 3);

		expect(paths.map((path) => `${path.subcategory}/${path.page}`)).toEqual([
			'sub-1/2',
			'sub-1/3',
			'sub-2/2',
			'sub-2/3',
		]);
	});
});
