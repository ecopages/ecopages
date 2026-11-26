import { describe, expect, it } from 'vitest';
import { CartInputError, CommerceBackendError } from '../errors';
import cartFixture from './__fixtures__/cart.json';
import collectionFixture from './__fixtures__/collection.json';
import productFixture from './__fixtures__/product.json';
import searchFixture from './__fixtures__/products-search.json';
import { createShopifyProvider } from './shopify-provider.server';

type RecordedCall = { url: string; headers: Headers; operation: string; variables: Record<string, unknown> };

/**
 * Answers each Storefront API call with the next recorded response and keeps what was sent.
 */
function recordedFetch(responses: Array<unknown | Response>) {
	const calls: RecordedCall[] = [];
	const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
		const operation = /(?:query|mutation)\s+(\w+)/u.exec(body.query)?.[1] ?? 'unknown';
		calls.push({ url: String(input), headers: new Headers(init?.headers), operation, variables: body.variables });
		const next = responses.shift();
		if (next === undefined) throw new Error(`Unexpected Storefront API call: ${operation}`);
		return next instanceof Response ? next : Response.json(next);
	};
	return { fetch, calls };
}

function providerWith(responses: Array<unknown | Response>, apiVersion = '2026-10') {
	const recorded = recordedFetch(responses);
	const provider = createShopifyProvider({
		storeDomain: 'https://north-pier.myshopify.com/',
		accessToken: 'public-token',
		apiVersion,
		fetch: recorded.fetch,
	});
	return { provider, calls: recorded.calls };
}

const cart = cartFixture.data.cart;
const cartResult = (
	operation: string,
	userErrors: Array<{ field: string[]; message: string }> = [],
	warnings: Array<{ code: string; message: string }> = [],
) => ({
	data: { [operation]: { cart: userErrors.length ? null : cart, userErrors, warnings } },
});
const jacketM = 'gid://shopify/ProductVariant/4470000000001';

describe('Shopify provider catalog', () => {
	it('reads a product from the Storefront API', async () => {
		const { provider, calls } = providerWith([productFixture]);

		const product = await provider.getProduct('harbor-jacket');

		expect(calls[0]).toMatchObject({
			url: 'https://north-pier.myshopify.com/api/2026-10/graphql.json',
			operation: 'Product',
			variables: { handle: 'harbor-jacket' },
		});
		expect(calls[0]?.headers.get('X-Shopify-Storefront-Access-Token')).toBe('public-token');
		expect(product).toMatchObject({
			handle: 'harbor-jacket',
			title: 'Harbor Jacket',
			productType: 'Jackets',
			priceRange: {
				min: { amount: '149.0', currencyCode: 'EUR' },
				max: { amount: '159.0', currencyCode: 'EUR' },
			},
			options: [
				{ name: 'Size', values: ['M', 'L'] },
				{ name: 'Color', values: ['Navy'] },
			],
		});
		expect(product?.variants[1]).toMatchObject({
			id: 'gid://shopify/ProductVariant/4470000000002',
			availableForSale: false,
			compareAtPrice: { amount: '189.0', currencyCode: 'EUR' },
		});
		expect(product?.images).toHaveLength(2);
	});

	it('uses the configured API version', async () => {
		const { provider, calls } = providerWith([productFixture], '2026-07');

		await provider.getProduct('harbor-jacket');

		expect(calls[0]?.url).toBe('https://north-pier.myshopify.com/api/2026-07/graphql.json');
	});

	it('resolves an unknown handle to null', async () => {
		const { provider } = providerWith([{ data: { product: null } }, { data: { collection: null } }]);

		expect(await provider.getProduct('missing')).toBeNull();
		expect(await provider.getCollection('missing')).toBeNull();
	});

	it('searches with the query and relevance order', async () => {
		const { provider, calls } = providerWith([searchFixture]);

		const results = await provider.searchProducts('shirt', { limit: 5 });

		expect(calls[0]?.variables).toEqual({ first: 5, query: 'shirt', sortKey: 'RELEVANCE' });
		expect(results.map((product) => product.handle)).toEqual(['oxford-shirt', 'deck-shirt']);
		expect(results[0]?.featuredImage).toBeNull();
	});

	it('reads a collection with its products', async () => {
		const { provider } = providerWith([collectionFixture]);

		const page = await provider.getCollection('outerwear');

		expect(page?.collection).toEqual({
			id: 'gid://shopify/Collection/4100000000001',
			handle: 'outerwear',
			title: 'Outerwear',
			description: 'Layers for weather.',
		});
		expect(page?.products.map((product) => product.handle)).toEqual(['harbor-jacket']);
	});

	it('fails loudly on GraphQL errors and HTTP failures', async () => {
		const { provider } = providerWith([
			{ errors: [{ message: 'Field "nope" does not exist' }] },
			new Response('Unauthorized', { status: 401 }),
			new Response('<html>Bad gateway</html>', { status: 200 }),
		]);

		await expect(provider.getProduct('harbor-jacket')).rejects.toThrow(/Field "nope" does not exist/u);
		await expect(provider.getProduct('harbor-jacket')).rejects.toBeInstanceOf(CommerceBackendError);
		await expect(provider.getProduct('harbor-jacket')).rejects.toThrow(/not JSON/u);
	});
});

describe('Shopify provider cart', () => {
	it('creates a cart when there is no cart id', async () => {
		const { provider, calls } = providerWith([cartResult('cartCreate')]);

		const result = await provider.setCartQuantities(undefined, [{ variantId: jacketM, quantity: 2 }]);

		expect(calls[0]).toMatchObject({
			operation: 'CartCreate',
			variables: { lines: [{ merchandiseId: jacketM, quantity: 2 }] },
		});
		expect(result).toMatchObject({
			id: cart.id,
			checkoutUrl: cart.checkoutUrl,
			totalQuantity: 2,
			subtotal: { amount: '298.0', currencyCode: 'EUR' },
		});
		expect(result.lines[0]).toMatchObject({
			variantId: jacketM,
			quantity: 2,
			productHandle: 'harbor-jacket',
			unitPrice: { amount: '149.0', currencyCode: 'EUR' },
			image: { url: expect.stringContaining('harbor-jacket.jpg') },
		});
	});

	it('updates, removes and adds lines of an existing cart', async () => {
		const otherVariant = 'gid://shopify/ProductVariant/4470000000009';
		const { provider, calls } = providerWith([
			cartFixture,
			cartResult('cartLinesRemove'),
			cartResult('cartLinesAdd'),
		]);

		await provider.setCartQuantities(cart.id, [
			{ variantId: jacketM, quantity: 0 },
			{ variantId: otherVariant, quantity: 1 },
		]);

		expect(calls.map((call) => call.operation)).toEqual(['Cart', 'CartLinesRemove', 'CartLinesAdd']);
		expect(calls[1]?.variables).toEqual({ cartId: cart.id, lineIds: [cart.lines.nodes[0]?.id] });
		expect(calls[2]?.variables).toEqual({ cartId: cart.id, lines: [{ merchandiseId: otherVariant, quantity: 1 }] });
	});

	it('sets the quantity of a line already in the cart', async () => {
		const { provider, calls } = providerWith([cartFixture, cartResult('cartLinesUpdate')]);

		await provider.setCartQuantities(cart.id, [{ variantId: jacketM, quantity: 5 }]);

		expect(calls[1]).toMatchObject({
			operation: 'CartLinesUpdate',
			variables: { cartId: cart.id, lines: [{ id: cart.lines.nodes[0]?.id, quantity: 5 }] },
		});
	});

	it('adds lines to a live cart', async () => {
		const { provider, calls } = providerWith([cartFixture, cartResult('cartLinesAdd')]);

		await provider.addToCart(cart.id, [{ variantId: jacketM, quantity: 1 }]);

		expect(calls.map((call) => call.operation)).toEqual(['Cart', 'CartLinesAdd']);
		expect(calls[1]?.variables).toEqual({ cartId: cart.id, lines: [{ merchandiseId: jacketM, quantity: 1 }] });
	});

	it('starts a new cart when the stored cart has expired', async () => {
		const { provider, calls } = providerWith([{ data: { cart: null } }, cartResult('cartCreate')]);

		await provider.addToCart('gid://shopify/Cart/expired', [{ variantId: jacketM, quantity: 1 }]);

		expect(calls.map((call) => call.operation)).toEqual(['Cart', 'CartCreate']);
	});

	it('reports user errors as cart input errors', async () => {
		const { provider } = providerWith([
			cartResult('cartCreate', [
				{ field: ['input', 'lines', '0', 'merchandiseId'], message: 'Variant is sold out' },
			]),
		]);

		const attempt = provider.addToCart(undefined, [{ variantId: jacketM, quantity: 1 }]);

		await expect(attempt).rejects.toBeInstanceOf(CartInputError);
		await expect(attempt).rejects.toThrow('Variant is sold out');
	});

	it('reports stock warnings as cart input errors', async () => {
		const { provider } = providerWith([
			cartResult(
				'cartCreate',
				[],
				[{ code: 'MERCHANDISE_OUT_OF_STOCK', message: 'Harbor Jacket is out of stock' }],
			),
		]);

		await expect(provider.addToCart(undefined, [{ variantId: jacketM, quantity: 1 }])).rejects.toThrow(
			'out of stock',
		);
	});

	it('keeps the cart when a warning is not a refusal', async () => {
		const { provider } = providerWith([
			cartResult('cartCreate', [], [{ code: 'MERCHANDISE_NOT_ENOUGH_STOCK', message: 'Only 1 left' }]),
		]);

		const result = await provider.addToCart(undefined, [{ variantId: jacketM, quantity: 3 }]);

		expect(result.id).toBe(cart.id);
	});

	it('treats an id that is not a Shopify cart as no cart, without calling the API', async () => {
		const { provider, calls } = providerWith([]);

		expect(await provider.getCart('demo-cart.W10')).toBeNull();
		expect(calls).toEqual([]);
	});

	it('refuses a variant id that is not a Shopify variant', async () => {
		const { provider, calls } = providerWith([]);

		await expect(provider.addToCart(undefined, [{ variantId: 'field-shirt', quantity: 1 }])).rejects.toBeInstanceOf(
			CartInputError,
		);
		expect(calls).toEqual([]);
	});

	it('sets one line and removes duplicate lines of the same variant', async () => {
		const duplicate = { ...cart.lines.nodes[0]!, id: 'gid://shopify/CartLine/duplicate' };
		const twoLines = {
			data: { cart: { ...cart, lines: { ...cart.lines, nodes: [...cart.lines.nodes, duplicate] } } },
		};
		const { provider, calls } = providerWith([
			twoLines,
			cartResult('cartLinesRemove'),
			cartResult('cartLinesUpdate'),
		]);

		await provider.setCartQuantities(cart.id, [{ variantId: jacketM, quantity: 4 }]);

		expect(calls[1]?.variables).toEqual({ cartId: cart.id, lineIds: [duplicate.id] });
		expect(calls[2]?.variables).toEqual({ cartId: cart.id, lines: [{ id: cart.lines.nodes[0]?.id, quantity: 4 }] });
	});

	it('refuses an addition that takes a line past the quantity cap', async () => {
		const full = {
			data: { cart: { ...cart, lines: { ...cart.lines, nodes: [{ ...cart.lines.nodes[0]!, quantity: 99 }] } } },
		};
		const { provider, calls } = providerWith([full]);

		await expect(provider.addToCart(cart.id, [{ variantId: jacketM, quantity: 1 }])).rejects.toThrow(/at most 99/u);
		expect(calls.map((call) => call.operation)).toEqual(['Cart']);
	});

	it('counts a variant repeated in one addition against the cap', async () => {
		const held = {
			data: { cart: { ...cart, lines: { ...cart.lines, nodes: [{ ...cart.lines.nodes[0]!, quantity: 98 }] } } },
		};
		const { provider, calls } = providerWith([held]);

		await expect(
			provider.addToCart(cart.id, [
				{ variantId: jacketM, quantity: 1 },
				{ variantId: jacketM, quantity: 1 },
			]),
		).rejects.toThrow(/at most 99/u);
		expect(calls.map((call) => call.operation)).toEqual(['Cart']);
	});

	it('reads every page of a long cart', async () => {
		const secondLine = { ...cart.lines.nodes[0]!, id: 'gid://shopify/CartLine/page-2', quantity: 1 };
		const firstPage = {
			data: { cart: { ...cart, lines: { ...cart.lines, pageInfo: { hasNextPage: true, endCursor: 'c1' } } } },
		};
		const secondPage = {
			data: { cart: { lines: { nodes: [secondLine], pageInfo: { hasNextPage: false, endCursor: null } } } },
		};
		const { provider, calls } = providerWith([firstPage, secondPage]);

		const result = await provider.getCart(cart.id);

		expect(calls[1]).toMatchObject({ operation: 'CartLines', variables: { id: cart.id, after: 'c1' } });
		expect(result?.lines.map((line) => line.id)).toEqual([cart.lines.nodes[0]?.id, secondLine.id]);
	});
});

describe('Shopify provider pagination', () => {
	it('reads every page of a product with many variants', async () => {
		const product = productFixture.data.product;
		const extra = {
			...product.variants.nodes[0]!,
			id: 'gid://shopify/ProductVariant/page-2',
			availableForSale: true,
		};
		const firstPage = {
			data: {
				product: {
					...product,
					variants: { ...product.variants, pageInfo: { hasNextPage: true, endCursor: 'v1' } },
				},
			},
		};
		const secondPage = {
			data: { product: { variants: { nodes: [extra], pageInfo: { hasNextPage: false, endCursor: null } } } },
		};
		const { provider, calls } = providerWith([firstPage, secondPage]);

		const result = await provider.getProduct('harbor-jacket');

		expect(calls[1]).toMatchObject({
			operation: 'ProductVariants',
			variables: { handle: 'harbor-jacket', after: 'v1' },
		});
		expect(result?.variants.map((variant) => variant.id)).toContain(extra.id);
		expect(result?.variants).toHaveLength(3);
	});
});
