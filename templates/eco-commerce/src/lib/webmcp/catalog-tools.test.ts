import { describe, expect, test, vi } from 'vitest';
import { browseStore, getCart, getProduct, postCartChange, readToolInput, searchCatalog } from './catalog-tools.ts';
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

	test('get_product opens the product page only when asked', async () => {
		const fetch = fakeFetch({ url: '/products/alder-oak-stool', title: 'Alder oak stool' });
		const navigate = vi.fn(async () => {});

		await getProduct({ product: 'alder-oak-stool' }, { fetch, navigate });
		expect(navigate).not.toHaveBeenCalled();

		await getProduct({ product: 'alder-oak-stool', open: true }, { fetch, navigate });
		expect(navigate).toHaveBeenCalledWith('/products/alder-oak-stool');
	});

	test('a refusal from the store reaches the agent as its error', async () => {
		const fetch = fakeFetch({ error: 'Your cart is full.' }, 409);

		expect(await postCartChange('/cart/add', { variantId: '1:oak', quantity: 1 }, { fetch })).toEqual({
			error: 'Your cart is full.',
		});
	});

	test('a cart change posts the same form fields the page forms send', async () => {
		const fetch = fakeFetch({ itemCount: 2, lines: [], subtotal: '$0.00' });

		await postCartChange('/cart/update', { variantId: '7:sand', quantity: 2 }, { fetch });

		const [url, init] = fetch.mock.calls[0]!;
		expect(url).toBe('/cart/update');
		expect(init?.body).toBeInstanceOf(FormData);
		expect(Object.fromEntries((init!.body as FormData).entries())).toEqual({ variantId: '7:sand', quantity: '2' });
	});

	test('calls fetch detached, as the browser fetch requires', async () => {
		const strictFetch = vi.fn(function (this: unknown) {
			if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
			return Promise.resolve(Response.json({ itemCount: 0, lines: [], subtotal: '$0.00' }));
		}) as unknown as typeof fetch;

		expect(await getCart({}, { fetch: strictFetch })).toMatchObject({ itemCount: 0 });
		expect(
			await postCartChange('/cart/add', { variantId: '1:oak', quantity: 1 }, { fetch: strictFetch }),
		).toMatchObject({
			itemCount: 0,
		});
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
