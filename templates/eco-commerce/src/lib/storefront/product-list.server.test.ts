import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { CommerceBackend } from '../commerce/backend.ts';
import { LIMITS } from '../limits.ts';
import type { ProductListJson } from './json.ts';
import { getSearchPage, productListAction } from './product-list.server.ts';
import { openTestBackend } from './test-backend.fixture.ts';

describe('product listing', () => {
	let subject: Awaited<ReturnType<typeof openTestBackend>>;
	let backend: CommerceBackend;

	beforeAll(async () => {
		subject = await openTestBackend();
		backend = subject.backend;
	});

	afterAll(() => subject.dispose());

	const list = async (query: Record<string, string | string[]>) =>
		(await (await productListAction(backend.catalog, query)).json()) as ProductListJson;

	test('the typeahead lists products matching "chair" with their link, price and image', async () => {
		const body = await list({ q: 'chair', pageSize: '6' });

		expect(body.items.length).toBeGreaterThan(0);
		expect(body.items.length).toBeLessThanOrEqual(6);
		for (const item of body.items) {
			expect(item.title.toLowerCase()).toContain('chair');
			expect(item.url).toMatch(/^\/products\/[a-z0-9-]+$/u);
			expect(item.thumbnail).toMatch(/^\/images\/products\/[a-z0-9-]+$/u);
		}
		expect(body.url).toBe('/search?q=chair');
	});

	test('a one-letter query lists nothing, and answers may be cached briefly', async () => {
		const response = await productListAction(backend.catalog, { q: 'c' });

		expect(((await response.json()) as ProductListJson).items).toEqual([]);
		expect(response.headers.get('cache-control')).toContain('max-age=');
	});

	test('filters and a sort apply to the JSON listing as to the page', async () => {
		const all = await list({ in: 'lounge-chairs' });
		const material = all.facets.materials[0]!;

		const filtered = await list({ in: 'lounge-chairs', material, sort: 'price-asc' });

		expect(filtered.items.length).toBeGreaterThan(0);
		expect(filtered.items.length).toBeLessThan(all.items.length);
		expect(filtered.items.every((item) => item.material === material)).toBe(true);
		expect(filtered.url).toBe(`/search?in=lounge-chairs&material=${material}&sort=price-asc`);
	});

	test('the search page lists matches for the term and nothing without a term or scope', async () => {
		const page = await getSearchPage(backend.catalog, { q: 'chair' });
		const empty = await getSearchPage(backend.catalog, {});

		expect(page.filters.q).toBe('chair');
		expect(page.results.items.length).toBeGreaterThan(0);
		expect(page.results.items.every((item) => item.title.toLowerCase().includes('chair'))).toBe(true);
		expect(empty.results.total).toBe(0);
	});

	test('?pageSize= shortens the list, and a size past the most a short list may hold is ignored', async () => {
		const broad = 'le';
		const short = await list({ q: broad, pageSize: '2' });
		const tooLarge = await list({ q: broad, pageSize: String(LIMITS.maxListSize + 1) });

		expect(short.items).toHaveLength(2);
		expect(tooLarge.total).toBeGreaterThan(LIMITS.maxListSize + 1);
		expect(tooLarge.items).toHaveLength((await list({ q: broad })).items.length);
	});
});
