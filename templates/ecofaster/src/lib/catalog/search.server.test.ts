import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { openTestCatalog } from '../db/catalog-database.fixture.ts';
import type { SearchSuggestionsResponse } from './search-suggestions.ts';
import { getSearchResults, searchSuggestionsAction, SUGGESTION_LIMIT } from './search.server.ts';

describe('search', () => {
	let database: Awaited<ReturnType<typeof openTestCatalog>>;

	beforeAll(async () => {
		database = await openTestCatalog();
	});

	afterAll(() => database.dispose());

	test('the typeahead lists products matching "chair" with their link, price and image', async () => {
		const response = await searchSuggestionsAction(database.db, 'chair');
		const body = (await response.json()) as SearchSuggestionsResponse;

		expect(body.query).toBe('chair');
		expect(body.results.length).toBeGreaterThan(0);
		expect(body.results.length).toBeLessThanOrEqual(SUGGESTION_LIMIT);
		for (const result of body.results) {
			expect(result.name.toLowerCase()).toContain('chair');
			expect(result.href).toMatch(/^\/products\/[a-z0-9-]+$/u);
			expect(result.image).toMatch(/^\/images\/products\/[a-z0-9-]+$/u);
			expect(result.price).toMatch(/^\$\d/u);
		}
	});

	test('the typeahead answers a short query with no results and lets caches keep answers briefly', async () => {
		const response = await searchSuggestionsAction(database.db, 'c');

		expect(((await response.json()) as SearchSuggestionsResponse).results).toEqual([]);
		expect(response.headers.get('cache-control')).toContain('max-age=');
	});

	test('the search page lists every match for the query', async () => {
		const page = await getSearchResults(database.db, 'chair');

		expect(page.term).toBe('chair');
		expect(page.products.length).toBeGreaterThan(SUGGESTION_LIMIT - 1);
		expect(page.products.every((product) => product.name.toLowerCase().includes('chair'))).toBe(true);
	});

	test('the search page without a query lists nothing', async () => {
		expect(await getSearchResults(database.db, undefined)).toEqual({ term: '', products: [], truncated: false });
	});
});
