import { describe, expect, test, vi } from 'vitest';
import { browseStore, getCart, getProduct, openProduct, readToolInput, searchCatalog } from './catalog-tools.ts';
import { addToCartTool, filterProductsTool } from './definitions.ts';

function fakeFetch(body: unknown, status = 200) {
	return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json(body, { status }));
}

describe('catalog tools', () => {
	test('search_catalog asks the product listing Endpoint with the query and limit', async () => {
		const fetch = fakeFetch({ items: [] });

		await searchCatalog({ query: 'oak chair', limit: 3 }, { fetch });

		expect(fetch).toHaveBeenCalledWith('/api/products?q=oak+chair&pageSize=3', expect.anything());
	});

	test('a call that fails its schema returns the error naming the field and sends nothing', async () => {
		const fetch = fakeFetch({});

		expect(await searchCatalog({ query: 'oak', limit: 100 }, { fetch })).toEqual({
			error: 'limit: expected an integer from 1 to 24',
		});
		expect(await getCart({ extra: true }, { fetch })).toEqual({ error: 'extra: not a field of this tool' });
		expect(fetch).not.toHaveBeenCalled();
	});

	test('browse_store without input browses the place the visitor is looking at', async () => {
		const fetch = fakeFetch({ level: 'category' });

		await browseStore({}, { collection: 'living', category: 'seating' }, { fetch });

		expect(fetch).toHaveBeenCalledWith('/api/browse?collection=living&category=seating', expect.anything());
	});

	test('browse_store with input browses the place it names', async () => {
		const fetch = fakeFetch({ level: 'collection' });

		await browseStore({ collection: 'kitchen' }, { collection: 'living' }, { fetch });

		expect(fetch).toHaveBeenCalledWith('/api/browse?collection=kitchen', expect.anything());
	});

	test('get_product reads the product, and open_product also shows its page', async () => {
		const fetch = fakeFetch({ url: '/products/alder-oak-stool', title: 'Alder oak stool' });
		const navigate = vi.fn(async () => {});

		expect(await getProduct({ product: 'alder-oak-stool' }, { fetch })).toMatchObject({ title: 'Alder oak stool' });
		expect(navigate).not.toHaveBeenCalled();

		await openProduct({ product: 'alder-oak-stool' }, { fetch, navigate });
		expect(navigate).toHaveBeenCalledWith('/products/alder-oak-stool');
	});

	test('open_product leaves the page where it is when the store does not have the product', async () => {
		const navigate = vi.fn(async () => {});

		const result = await openProduct(
			{ product: 'no-such-stool' },
			{ fetch: fakeFetch({ error: 'Not found' }, 404), navigate },
		);

		expect(result).toEqual({ error: 'Not found' });
		expect(navigate).not.toHaveBeenCalled();
	});

	test('add_to_cart and filter_products check their bounds and enums', () => {
		expect(readToolInput(addToCartTool, {})).toEqual({});
		expect(readToolInput(addToCartTool, { quantity: 100 })).toEqual({
			error: 'quantity: expected an integer from 1 to 99',
		});
		expect(readToolInput(filterProductsTool, { sort: 'cheapest' })).toEqual({
			error: 'sort: expected one of featured, price-asc, price-desc, name',
		});
	});
});
