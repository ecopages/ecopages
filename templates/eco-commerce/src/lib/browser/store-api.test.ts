import { describe, expect, test, vi } from 'vitest';
import { getJson, postCartChange } from './store-api.ts';

function fakeFetch(body: unknown, status = 200) {
	return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json(body, { status }));
}

describe('store API', () => {
	test('a refusal from the store comes back as its error', async () => {
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

		expect(await getJson('/api/cart', { fetch: strictFetch })).toMatchObject({ itemCount: 0 });
		expect(
			await postCartChange('/cart/add', { variantId: '1:oak', quantity: 1 }, { fetch: strictFetch }),
		).toMatchObject({
			itemCount: 0,
		});
	});

	test('an unreachable store and an unreadable answer come back as errors', async () => {
		const offline = vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		}) as unknown as typeof fetch;
		const garbled = vi.fn(async () => new Response('not json', { status: 200 })) as unknown as typeof fetch;

		expect(await getJson('/api/cart', { fetch: offline })).toEqual({ error: 'The store could not be reached.' });
		expect(await getJson('/api/cart', { fetch: garbled })).toEqual({
			error: 'The store sent an unreadable answer.',
		});
	});
});
