import { describe, expect, it } from 'vitest';
import { CartInputError, CommerceBackendError } from '../errors';
import cartFixture from './__fixtures__/cart.json';
import collectionFixture from './__fixtures__/collection.json';
import productFixture from './__fixtures__/product.json';
import searchFixture from './__fixtures__/products-search.json';
import { createShopifyProvider, htmlToText } from './shopify-provider.server';

type RecordedCall = {
	url: string;
	headers: Headers;
	operation: string;
	query: string;
	variables: Record<string, unknown>;
};

/**
 * Answers each Storefront API call with the next recorded response and keeps what was sent.
 */
function recordedFetch(responses: Array<unknown | Response>) {
	const calls: RecordedCall[] = [];
	const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
		const operation = /(?:query|mutation)\s+(\w+)/u.exec(body.query)?.[1] ?? 'unknown';
		calls.push({
			url: String(input),
			headers: new Headers(init?.headers),
			operation,
			query: body.query,
			variables: body.variables,
		});
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

		expect(calls[0]?.variables).toMatchObject({ first: 5, query: 'shirt', sortKey: 'RELEVANCE' });
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

	describe('sorted and paged product lists', () => {
		const node = (index: number) => ({
			...searchFixture.data.products.nodes[0]!,
			id: `gid://shopify/Product/${index}`,
			handle: `product-${index}`,
		});
		const connection = (from: number, count: number, total: number) => ({
			nodes: Array.from({ length: count }, (_, index) => node(from + index)),
			pageInfo: { hasNextPage: from + count <= total, endCursor: `cursor-${from + count - 1}` },
		});

		it('asks Shopify for the order and follows the cursors to the page, in 250 product requests', async () => {
			const { provider, calls } = providerWith([
				{ data: { products: connection(1, 250, 300) } },
				{ data: { products: connection(251, 50, 300) } },
			]);

			const products = await provider.listProducts({ limit: 30, offset: 270, sort: 'price-ascending' });

			expect(calls.map((call) => call.variables)).toEqual([
				{ first: 250, after: null, sortKey: 'PRICE', reverse: false },
				{ first: 50, after: 'cursor-250', sortKey: 'PRICE', reverse: false },
			]);
			expect(products.map((product) => product.handle)).toEqual(
				Array.from({ length: 30 }, (_, index) => `product-${271 + index}`),
			);
		});

		it('reverses the order for a descending sort and stops when the list ends', async () => {
			const { provider, calls } = providerWith([
				{ data: { products: { ...connection(1, 3, 3), pageInfo: { hasNextPage: false, endCursor: null } } } },
			]);

			const products = await provider.listProducts({ limit: 10, sort: 'title-descending' });

			expect(calls).toHaveLength(1);
			expect(calls[0]?.variables).toEqual({ first: 10, after: null, sortKey: 'TITLE', reverse: true });
			expect(products).toHaveLength(3);
		});

		it('pages the products of a collection the same way, in the order of Shopify', async () => {
			const collection = (from: number, count: number) => ({
				data: {
					collection: {
						id: 'gid://shopify/Collection/1',
						handle: 'all-things',
						title: 'All things',
						description: '',
						products: connection(from, count, 300),
					},
				},
			});
			const { provider, calls } = providerWith([collection(1, 250), collection(251, 50)]);

			const page = await provider.getCollection('all-things', {
				limit: 30,
				offset: 270,
				sort: 'price-descending',
			});

			expect(calls.map((call) => call.variables)).toEqual([
				{ handle: 'all-things', first: 250, after: null, sortKey: 'PRICE', reverse: true },
				{ handle: 'all-things', first: 50, after: 'cursor-250', sortKey: 'PRICE', reverse: true },
			]);
			expect(page?.collection.handle).toBe('all-things');
			expect(page?.products).toHaveLength(30);
			expect(page?.products[0]?.handle).toBe('product-271');
		});

		it('resolves a collection that does not exist to null', async () => {
			const { provider } = providerWith([{ data: { collection: null } }]);

			expect(await provider.getCollection('missing', { limit: 5, sort: 'title-ascending' })).toBeNull();
		});
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
	const otherVariant = 'gid://shopify/ProductVariant/4470000000009';

	/**
	 * The state read a cart change starts from: the cart, and which of the requested variants are on sale.
	 */
	const state = (
		cartNodes = cart.lines.nodes,
		variants: Array<{ id: string; availableForSale: boolean } | null> = [],
	) => ({
		data: { cart: { ...cart, lines: { ...cart.lines, nodes: cartNodes } }, variants },
	});

	/**
	 * A `CartChange` answer: each alias returns the given cart, as Shopify returns the cart after every field.
	 */
	const changed = (
		aliases: string[],
		nodes = cart.lines.nodes,
		warnings: Array<{ code: string; message: string }> = [],
	) => ({
		data: Object.fromEntries(
			aliases.map((alias) => [
				alias,
				{ cart: { ...cart, lines: { ...cart.lines, nodes } }, userErrors: [], warnings },
			]),
		),
	});

	const lineFor = (variantId: string, quantity: number) => ({
		...cart.lines.nodes[0]!,
		id: `gid://shopify/CartLine/${variantId}`,
		quantity,
		merchandise: { ...cart.lines.nodes[0]!.merchandise, id: variantId },
	});

	it('creates a cart in one request when there is no cart id', async () => {
		const { provider, calls } = providerWith([cartResult('cartCreate')]);

		const result = await provider.setCartQuantities(undefined, [{ variantId: jacketM, quantity: 2 }]);

		expect(calls).toHaveLength(1);
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

	it('replaces lines with one read, then the addition, then the removal', async () => {
		const { provider, calls } = providerWith([
			state(cart.lines.nodes, [{ id: otherVariant, availableForSale: true }]),
			changed(['add'], [...cart.lines.nodes, lineFor(otherVariant, 1)]),
			changed(['remove'], [lineFor(otherVariant, 1)]),
		]);

		const result = await provider.setCartQuantities(cart.id, [
			{ variantId: jacketM, quantity: 0 },
			{ variantId: otherVariant, quantity: 1 },
		]);

		expect(calls.map((call) => call.operation)).toEqual(['CartState', 'CartChange', 'CartChange']);
		expect(calls[0]?.variables).toEqual({ id: cart.id, variants: [otherVariant] });
		expect(calls[1]?.variables).toEqual({ cartId: cart.id, add: [{ merchandiseId: otherVariant, quantity: 1 }] });
		expect(calls[2]?.variables).toEqual({ cartId: cart.id, remove: [cart.lines.nodes[0]?.id] });
		expect(result.lines.map((line) => line.variantId)).toEqual([otherVariant]);
	});

	it('refuses a sold-out addition before changing anything', async () => {
		const { provider, calls } = providerWith([
			state(cart.lines.nodes, [{ id: otherVariant, availableForSale: false }]),
		]);

		await expect(provider.setCartQuantities(cart.id, [{ variantId: otherVariant, quantity: 1 }])).rejects.toThrow(
			/sold out or do not exist/u,
		);
		expect(calls.map((call) => call.operation)).toEqual(['CartState']);
	});

	it('sends no mutation when the cart already holds the quantities', async () => {
		const { provider, calls } = providerWith([state()]);

		const result = await provider.setCartQuantities(cart.id, [{ variantId: jacketM, quantity: 2 }]);

		expect(calls.map((call) => call.operation)).toEqual(['CartState']);
		expect(result.lines[0]).toMatchObject({ variantId: jacketM, quantity: 2 });
	});

	it('removes nothing when Shopify refuses the addition', async () => {
		const { provider, calls } = providerWith([
			state(cart.lines.nodes, [{ id: otherVariant, availableForSale: true }]),
			{
				data: {
					add: {
						cart: { id: cart.id },
						userErrors: [{ field: ['lines', '0', 'merchandiseId'], message: 'Variant is not for sale' }],
						warnings: [],
					},
				},
			},
		]);

		const attempt = provider.setCartQuantities(cart.id, [
			{ variantId: jacketM, quantity: 0 },
			{ variantId: otherVariant, quantity: 1 },
		]);

		await expect(attempt).rejects.toBeInstanceOf(CartInputError);
		await expect(attempt).rejects.toThrow('Variant is not for sale');
		expect(calls.map((call) => call.operation)).toEqual(['CartState', 'CartChange']);
		expect(calls[1]?.variables).toEqual({ cartId: cart.id, add: [{ merchandiseId: otherVariant, quantity: 1 }] });
	});

	it('returns the cart as it now is, with a message, when the removal after the additions is refused', async () => {
		const { provider, calls } = providerWith([
			state(cart.lines.nodes, [{ id: otherVariant, availableForSale: true }]),
			changed(['add'], [...cart.lines.nodes, lineFor(otherVariant, 1)]),
			{
				data: {
					remove: {
						cart: null,
						userErrors: [{ field: ['lineIds', '0'], message: 'The line does not exist' }],
						warnings: [],
					},
				},
			},
			{
				data: {
					cart: { ...cart, lines: { ...cart.lines, nodes: [...cart.lines.nodes, lineFor(otherVariant, 1)] } },
				},
			},
		]);

		const result = await provider.setCartQuantities(cart.id, [
			{ variantId: jacketM, quantity: 0 },
			{ variantId: otherVariant, quantity: 1 },
		]);

		expect(calls.map((call) => call.operation)).toEqual(['CartState', 'CartChange', 'CartChange', 'Cart']);
		expect(result.lines.map((line) => line.variantId)).toEqual([jacketM, otherVariant]);
		expect(result.messages).toEqual([
			expect.objectContaining({
				type: 'error',
				code: 'change_incomplete',
				content: expect.stringContaining('The line does not exist'),
			}),
		]);
	});

	it('reports the refusal as an error when the cart cannot be read again', async () => {
		const { provider } = providerWith([
			state(cart.lines.nodes, [{ id: otherVariant, availableForSale: true }]),
			changed(['add'], [...cart.lines.nodes, lineFor(otherVariant, 1)]),
			{
				data: {
					remove: {
						cart: null,
						userErrors: [{ field: ['lineIds', '0'], message: 'The line does not exist' }],
						warnings: [],
					},
				},
			},
			new Response('', { status: 500 }),
		]);

		await expect(
			provider.setCartQuantities(cart.id, [
				{ variantId: jacketM, quantity: 0 },
				{ variantId: otherVariant, quantity: 1 },
			]),
		).rejects.toThrow('The line does not exist');
	});

	it('reports a refused update as it is when nothing was added', async () => {
		const { provider } = providerWith([
			state(),
			{
				data: {
					update: {
						cart: null,
						userErrors: [{ field: ['lines', '0', 'quantity'], message: 'Quantity is over the limit' }],
						warnings: [],
					},
				},
			},
		]);

		const attempt = provider.setCartQuantities(cart.id, [{ variantId: jacketM, quantity: 5 }]);

		await expect(attempt).rejects.toThrow(/^Quantity is over the limit$/u);
	});

	it('refuses a variant listed twice when setting quantities, before any request', async () => {
		const { provider, calls } = providerWith([]);

		await expect(
			provider.setCartQuantities(cart.id, [
				{ variantId: jacketM, quantity: 60 },
				{ variantId: jacketM, quantity: 60 },
			]),
		).rejects.toThrow(`${jacketM} is listed twice.`);
		expect(calls).toEqual([]);
	});

	it('creates a cart when the stored id is not a Shopify cart, without reading it', async () => {
		const { provider, calls } = providerWith([cartResult('cartCreate')]);

		await provider.setCartQuantities('demo-cart.W10', [{ variantId: jacketM, quantity: 2 }]);

		expect(calls.map((call) => call.operation)).toEqual(['CartCreate']);
	});

	it('creates a cart when the stored cart has expired', async () => {
		const { provider, calls } = providerWith([{ data: { cart: null, variants: [] } }, cartResult('cartCreate')]);

		await provider.setCartQuantities('gid://shopify/Cart/expired', [{ variantId: jacketM, quantity: 2 }]);

		expect(calls.map((call) => call.operation)).toEqual(['CartState', 'CartCreate']);
	});

	it('refuses an added variant that comes back at quantity 0', async () => {
		const { provider, calls } = providerWith([
			state(cart.lines.nodes, [{ id: otherVariant, availableForSale: true }]),
			changed(
				['add'],
				[...cart.lines.nodes, lineFor(otherVariant, 0)],
				[{ code: 'MERCHANDISE_OUT_OF_STOCK', message: 'The other variant is out of stock' }],
			),
		]);

		await expect(
			provider.setCartQuantities(cart.id, [
				{ variantId: jacketM, quantity: 0 },
				{ variantId: otherVariant, quantity: 1 },
			]),
		).rejects.toThrow('out of stock');
		expect(calls.map((call) => call.operation)).toEqual(['CartState', 'CartChange']);
	});

	it('finishes a change when a stock warning is about a line it does not add', async () => {
		const { provider } = providerWith([
			state(cart.lines.nodes, [{ id: otherVariant, availableForSale: true }]),
			changed(
				['add'],
				[...cart.lines.nodes, lineFor(otherVariant, 1)],
				[{ code: 'MERCHANDISE_OUT_OF_STOCK', message: 'Harbor Jacket is out of stock' }],
			),
		]);

		const result = await provider.setCartQuantities(cart.id, [
			{ variantId: jacketM, quantity: 2 },
			{ variantId: otherVariant, quantity: 1 },
		]);

		expect(result.lines.map((line) => line.variantId)).toEqual([jacketM, otherVariant]);
	});

	it('sets the quantity of a line already in the cart', async () => {
		const { provider, calls } = providerWith([state(), changed(['update'])]);

		await provider.setCartQuantities(cart.id, [{ variantId: jacketM, quantity: 5 }]);

		expect(calls[1]).toMatchObject({
			operation: 'CartChange',
			variables: { cartId: cart.id, update: [{ id: cart.lines.nodes[0]?.id, quantity: 5 }] },
		});
	});

	it('sets one line and removes duplicate lines of the same variant in one request', async () => {
		const duplicate = { ...cart.lines.nodes[0]!, id: 'gid://shopify/CartLine/duplicate' };
		const { provider, calls } = providerWith([
			state([...cart.lines.nodes, duplicate]),
			changed(['update', 'remove']),
		]);

		await provider.setCartQuantities(cart.id, [{ variantId: jacketM, quantity: 4 }]);

		expect(calls.map((call) => call.operation)).toEqual(['CartState', 'CartChange']);
		expect(calls[1]?.variables).toEqual({
			cartId: cart.id,
			update: [{ id: cart.lines.nodes[0]?.id, quantity: 4 }],
			remove: [duplicate.id],
		});
	});

	it('adds lines to a live cart after reading it for the line cap', async () => {
		const { provider, calls } = providerWith([
			cartFixture,
			changed(['add'], [{ ...cart.lines.nodes[0]!, quantity: 3 }]),
		]);

		await provider.addToCart(cart.id, [{ variantId: jacketM, quantity: 1 }]);

		expect(calls.map((call) => call.operation)).toEqual(['Cart', 'CartChange']);
		expect(calls[1]?.variables).toEqual({ cartId: cart.id, add: [{ merchandiseId: jacketM, quantity: 1 }] });
	});

	it('refuses an addition to a line that a stock warning left unchanged', async () => {
		const { provider } = providerWith([
			cartFixture,
			changed(['add'], cart.lines.nodes, [{ code: 'MERCHANDISE_NOT_ENOUGH_STOCK', message: 'Only 2 left' }]),
		]);

		await expect(provider.addToCart(cart.id, [{ variantId: jacketM, quantity: 1 }])).rejects.toThrow('Only 2 left');
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

	it('refuses a variant that a stock warning kept out of the cart', async () => {
		const { provider } = providerWith([
			cartResult(
				'cartCreate',
				[],
				[{ code: 'MERCHANDISE_OUT_OF_STOCK', message: 'Harbor Jacket is out of stock' }],
			),
		]);

		await expect(
			provider.addToCart(undefined, [{ variantId: 'gid://shopify/ProductVariant/sold-out', quantity: 1 }]),
		).rejects.toThrow('out of stock');
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

	it('refuses an addition that takes a line past the quantity cap', async () => {
		const { provider, calls } = providerWith([
			{
				data: {
					cart: { ...cart, lines: { ...cart.lines, nodes: [{ ...cart.lines.nodes[0]!, quantity: 99 }] } },
				},
			},
		]);

		await expect(provider.addToCart(cart.id, [{ variantId: jacketM, quantity: 1 }])).rejects.toThrow(/at most 99/u);
		expect(calls.map((call) => call.operation)).toEqual(['Cart']);
	});

	it('counts a variant repeated in one addition against the cap', async () => {
		const { provider, calls } = providerWith([
			{
				data: {
					cart: { ...cart, lines: { ...cart.lines, nodes: [{ ...cart.lines.nodes[0]!, quantity: 98 }] } },
				},
			},
		]);

		await expect(
			provider.addToCart(cart.id, [
				{ variantId: jacketM, quantity: 1 },
				{ variantId: jacketM, quantity: 1 },
			]),
		).rejects.toThrow(/at most 99/u);
		expect(calls.map((call) => call.operation)).toEqual(['Cart']);
	});

	it('sets a line back to the cap when a change from another tab pushed it past', async () => {
		const held = (quantity: number) => [{ ...cart.lines.nodes[0]!, quantity }];
		const { provider, calls } = providerWith([
			{ data: { cart: { ...cart, lines: { ...cart.lines, nodes: held(98) } } } },
			changed(['add'], held(100)),
			changed(['update'], held(99)),
		]);

		const result = await provider.addToCart(cart.id, [{ variantId: jacketM, quantity: 1 }]);

		expect(calls.map((call) => call.operation)).toEqual(['Cart', 'CartChange', 'CartChange']);
		expect(calls[2]?.variables).toEqual({
			cartId: cart.id,
			update: [{ id: cart.lines.nodes[0]?.id, quantity: 99 }],
		});
		expect(result.lines[0]?.quantity).toBe(99);
		expect(result.messages).toEqual([expect.objectContaining({ type: 'warning', code: 'quantity_capped' })]);
	});

	it('sets a line back to the cap after a set that another tab raced', async () => {
		const held = (quantity: number) => [{ ...cart.lines.nodes[0]!, quantity }];
		const { provider, calls } = providerWith([
			state(held(2)),
			changed(['update'], held(120)),
			changed(['update'], held(99)),
		]);

		const result = await provider.setCartQuantities(cart.id, [{ variantId: jacketM, quantity: 50 }]);

		expect(calls.map((call) => call.operation)).toEqual(['CartState', 'CartChange', 'CartChange']);
		expect(result.lines[0]?.quantity).toBe(99);
	});

	it('leaves a cart within the cap as it is, with no further request and no message', async () => {
		const { provider, calls } = providerWith([
			cartFixture,
			changed(['add'], [{ ...cart.lines.nodes[0]!, quantity: 3 }]),
		]);

		const result = await provider.addToCart(cart.id, [{ variantId: jacketM, quantity: 1 }]);

		expect(calls).toHaveLength(2);
		expect(result.messages).toBeUndefined();
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

describe('Shopify provider store information', () => {
	it('reads a product by its GID', async () => {
		const { provider, calls } = providerWith([productFixture]);

		const product = await provider.getProduct('gid://shopify/Product/8790000000001');

		expect(calls[0]).toMatchObject({
			operation: 'ProductById',
			variables: { id: 'gid://shopify/Product/8790000000001' },
		});
		expect(product?.handle).toBe('harbor-jacket');
	});

	it('has no default variant when the first one is sold out', async () => {
		const { provider } = providerWith([searchFixture]);

		const [, deckShirt] = await provider.searchProducts('shirt');

		expect(deckShirt?.defaultVariantId).toBeNull();
		expect(deckShirt?.options).toEqual([{ name: 'Size', values: ['M', 'L'] }]);
	});

	it('lists the shop policies as plain text', async () => {
		const { provider, calls } = providerWith([
			{
				data: {
					shop: {
						refundPolicy: {
							handle: 'refund-policy',
							title: 'Refund policy',
							body: '<p>Returns within <strong>30 days</strong>.</p><p>Free &amp; easy.</p>',
						},
						shippingPolicy: null,
						privacyPolicy: null,
						termsOfService: { handle: 'terms-of-service', title: 'Terms', body: '<p>Be kind.</p>' },
					},
				},
			},
		]);

		const policies = await provider.listPolicies();

		expect(calls[0]?.operation).toBe('ShopPolicies');
		expect(policies).toEqual([
			{
				handle: 'refund-policy',
				type: 'refund_policy',
				title: 'Refund policy',
				body: 'Returns within 30 days.\n\nFree & easy.',
			},
			{ handle: 'terms-of-service', type: 'terms_of_service', title: 'Terms', body: 'Be kind.' },
		]);
	});
});

describe('htmlToText', () => {
	it('drops scripts and styles and decodes entities once', () => {
		expect(
			htmlToText(
				'<style>p{}</style><p>We&rsquo;re &#8220;kind&#8221; &amp;lt;3</p><script>alert(1)</script><br>Bye',
			),
		).toBe('We\u2019re \u201Ckind\u201D &lt;3\n\nBye');
	});
});
