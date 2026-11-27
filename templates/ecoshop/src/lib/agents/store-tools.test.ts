import { describe, expect, it } from 'vitest';
import { createDemoProvider } from '@/lib/commerce/demo/demo-provider';
import type { CommerceProvider } from '@/lib/commerce/types';
import { resultSize } from './store-tool-support.server';
import { runStoreTool, storeTools, type StoreToolContext } from './store-tools.server';

const ORIGIN = 'https://shop.test';
const provider = createDemoProvider();
const fieldShirtM = 'gid://ecoshop/ProductVariant/field-shirt-m';
const tote = 'gid://ecoshop/ProductVariant/canvas-tote';

const page = (cartId?: string, currentProductHandle?: string): StoreToolContext => ({
	provider,
	origin: ORIGIN,
	surface: 'page',
	cartId,
	currentProductHandle,
});
const mcp: StoreToolContext = { provider, origin: ORIGIN, surface: 'mcp', cartId: undefined };

type Structured = Record<string, unknown>;
type CartResult = {
	id: string;
	item_count: number;
	line_items: Array<{ id: string; quantity: number; item: { id: string; title: string } }>;
	messages?: Array<{ type: string; code?: string }>;
};

async function call(name: string, input: unknown, context: StoreToolContext) {
	const outcome = await runStoreTool(name, input, context);
	return { ...outcome, structured: outcome.result.structuredContent as Structured };
}

async function cartWith(lines: Array<{ id: string; quantity: number }>): Promise<string> {
	const created = await call(
		'create_cart',
		{ cart: { line_items: lines.map(({ id, quantity }) => ({ item: { id }, quantity })) } },
		page(),
	);
	return created.cartId ?? '';
}

describe('store tools: names and surfaces', () => {
	it('matches the Shopify storefront tool names on the page', () => {
		expect(storeTools.filter((tool) => tool.surfaces.includes('page')).map((tool) => tool.name)).toEqual([
			'search_catalog',
			'browse_store',
			'get_product',
			'show_variant',
			'get_cart',
			'create_cart',
			'update_cart',
			'cancel_cart',
			'proceed_to_checkout',
			'ask_business',
			'add_to_cart',
			'get_ucp_profile',
		]);
	});
});

describe('store tools: catalog', () => {
	it('searches the catalog in the Shopify result shape over /mcp', async () => {
		const { structured } = await call('search_catalog', { catalog: { query: 'shirt' } }, mcp);

		expect(structured.search_url).toBe(`${ORIGIN}/search?q=shirt`);
		expect(structured.products).toEqual([
			expect.objectContaining({
				id: 'gid://ecoshop/Product/field-shirt',
				handle: 'field-shirt',
				title: 'Field Shirt',
				variant_id: 'gid://ecoshop/ProductVariant/field-shirt-s',
				url: `${ORIGIN}/products/field-shirt`,
				price_range: { amount: 6800, currency: 'USD', display: '$68.00' },
				available: true,
				options: [{ name: 'Size', values: ['S', 'M', 'L'] }],
			}),
			expect.objectContaining({ handle: 'linen-overshirt' }),
			expect.objectContaining({ handle: 'trail-tee' }),
		]);
	});

	it('lists collections, then the products of one, sorted', async () => {
		const all = await call('browse_store', {}, page());
		const home = await call('browse_store', { collection: 'home', sort_by: 'price-descending' }, page());

		expect(all.structured.collections).toContainEqual(
			expect.objectContaining({ handle: 'home', url: `${ORIGIN}/collections/home` }),
		);
		expect(home.structured.collection_title).toBe('Home');
		expect((home.structured.products as Array<{ handle: string }>).map((product) => product.handle)).toEqual([
			'steel-bottle',
			'beeswax-wraps',
		]);
	});

	it('navigates to a collection only when asked, and only on a page', async () => {
		const asked = await call('browse_store', { collection: 'apparel', navigate: true }, page());
		const notAsked = await call('browse_store', { collection: 'apparel' }, page());
		const overMcp = await call('browse_store', { collection: 'apparel', navigate: true }, mcp);

		expect(asked.navigateTo).toBe(`${ORIGIN}/collections/apparel`);
		expect(asked.structured.navigated).toBe(true);
		for (const outcome of [notAsked, overMcp]) {
			expect(outcome.navigateTo).toBeUndefined();
			expect(outcome.structured.navigated).toBe(false);
		}
	});

	it('reads the current page product and narrows variants by options', async () => {
		const outcome = await call(
			'get_product',
			{ catalog: { selected_options: [{ name: 'Capacity', value: '750 ml' }] } },
			page(undefined, 'steel-bottle'),
		);

		expect(outcome.structured).toMatchObject({
			handle: 'steel-bottle',
			variants: [{ id: 'gid://ecoshop/ProductVariant/steel-bottle-750-ml', title: '750 ml', price: '$29.00' }],
		});
	});

	it('reads a product with its variants narrowed by options in the full Shopify shape over /mcp', async () => {
		const outcome = await call(
			'get_product',
			{ catalog: { id: 'steel-bottle', selected_options: [{ name: 'Capacity', value: '750 ml' }] } },
			mcp,
		);

		expect(outcome.structured).toMatchObject({
			handle: 'steel-bottle',
			variants: [
				{
					id: 'gid://ecoshop/ProductVariant/steel-bottle-750-ml',
					options: [{ name: 'Capacity', value: '750 ml' }],
					price: { amount: 2900, currency: 'USD', display: '$29.00' },
					availability: { available: true },
				},
			],
			available_options: [[{ name: 'Capacity', value: '750 ml' }]],
		});
	});

	it('accepts a product GID, URL path or Markdown URL as the id', async () => {
		const byGid = await call('get_product', { catalog: { id: 'gid://ecoshop/Product/canvas-tote' } }, page());
		const byPath = await call('get_product', { catalog: { id: '/products/canvas-tote' } }, page());
		const byMarkdown = await call(
			'get_product',
			{ catalog: { id: `${ORIGIN}/products/canvas-tote/index.md` } },
			page(),
		);

		expect(byGid.structured.handle).toBe('canvas-tote');
		expect(byPath.structured.handle).toBe('canvas-tote');
		expect(byMarkdown.structured.handle).toBe('canvas-tote');
	});

	it('shows a variant picked by a partial option selection', async () => {
		const outcome = await call(
			'show_variant',
			{ catalog: { handle: 'merino-beanie', selected_options: [{ name: 'Color', value: 'Charcoal' }] } },
			page(),
		);

		expect(outcome.navigateTo).toBe(
			`${ORIGIN}/products/merino-beanie?variant=${encodeURIComponent('gid://ecoshop/ProductVariant/merino-beanie-charcoal')}`,
		);
	});

	it('answers a policy question from the published policies', async () => {
		const { structured } = await call('ask_business', { ask: { query: 'Do you offer gift wrapping?' } }, page());

		expect((structured.answer as { plain: string }).plain).toMatch(/gift wrapping at checkout/u);
		expect(structured.links).toContainEqual(
			expect.objectContaining({ type: 'faq', url: `${ORIGIN}/policies/faq` }),
		);
	});

	it('says so when no policy covers the question', async () => {
		const { structured } = await call('ask_business', { ask: { query: 'zeppelin parking' } }, page());

		expect((structured.answer as { plain: string }).plain).toMatch(/no published information/u);
	});
});

describe('store tools: the shopper cart on a page', () => {
	it('empties a cart that holds two lines of one variant, listing the variant once', async () => {
		const cartId = await cartWith([{ id: fieldShirtM, quantity: 2 }]);
		const stored = await provider.getCart(cartId);
		const doubled = { ...stored!, lines: [...stored!.lines, { ...stored!.lines[0]!, id: 'line-2' }] };
		const sent: unknown[] = [];
		const twoLines: CommerceProvider = {
			...provider,
			getCart: async () => doubled,
			setCartQuantities: async (id, lines) => {
				sent.push(lines);
				return provider.setCartQuantities(id, lines);
			},
		};

		const outcome = await call('cancel_cart', {}, { ...page(cartId), provider: twoLines });

		expect(outcome.result.isError).toBeFalsy();
		expect(sent).toEqual([[{ variantId: fieldShirtM, quantity: 0 }]]);
	});

	it('refuses a new cart that lists a variant twice', async () => {
		const outcome = await call(
			'create_cart',
			{
				cart: {
					line_items: [
						{ item: { id: fieldShirtM }, quantity: 60 },
						{ item: { id: fieldShirtM }, quantity: 60 },
					],
				},
			},
			page(),
		);

		expect(outcome.result.isError).toBe(true);
		expect(outcome.result.content[0]?.text).toContain(`lists ${fieldShirtM} twice`);
		expect(outcome.cartId).toBeUndefined();
	});

	it('creates a cart only while the cart is empty', async () => {
		const created = await call(
			'create_cart',
			{ cart: { line_items: [{ item: { id: fieldShirtM }, quantity: 2 }] } },
			page(),
		);
		const again = await call(
			'create_cart',
			{ cart: { line_items: [{ item: { id: tote }, quantity: 1 }] } },
			page(created.cartId),
		);

		expect(created.structured).toMatchObject({
			item_count: 2,
			line_items: [{ quantity: 2, item: { id: fieldShirtM } }],
		});
		expect(again.cartId).toBeUndefined();
		expect((again.structured as CartResult).messages).toContainEqual(
			expect.objectContaining({ type: 'error', code: 'cart_not_empty' }),
		);
	});

	it('replaces the cart with exactly the listed lines', async () => {
		const cartId = await cartWith([
			{ id: fieldShirtM, quantity: 1 },
			{ id: tote, quantity: 1 },
		]);
		const before = (await call('get_cart', {}, page(cartId))).structured as CartResult;
		const shirtLine = before.line_items.find((line) => line.item.id === fieldShirtM);

		const after = await call(
			'update_cart',
			{ id: before.id, cart: { line_items: [{ id: shirtLine?.id, item: { id: fieldShirtM }, quantity: 3 }] } },
			page(cartId),
		);

		expect((after.structured as CartResult).line_items).toEqual([
			expect.objectContaining({ quantity: 3, item: expect.objectContaining({ id: fieldShirtM }) }),
		]);
	});

	it('changes nothing when the cart changed since the agent read it', async () => {
		const cartId = await cartWith([{ id: fieldShirtM, quantity: 1 }]);

		const outcome = await call('update_cart', { id: 'demo-cart.stale', cart: { line_items: [] } }, page(cartId));

		expect(outcome.cartId).toBeUndefined();
		expect((outcome.structured as CartResult).item_count).toBe(1);
		expect((outcome.structured as CartResult).messages).toContainEqual(
			expect.objectContaining({ type: 'error', code: 'cart_changed' }),
		);
	});

	it('empties the cart', async () => {
		const cartId = await cartWith([{ id: tote, quantity: 2 }]);

		const outcome = await call('cancel_cart', {}, page(cartId));

		expect(outcome.structured).toEqual({ cleared: true, previous_item_count: 2 });
		expect(await provider.getCart(outcome.cartId ?? '')).toMatchObject({ totalQuantity: 0 });
	});

	it('moves to checkout only with items in the cart', async () => {
		const empty = await call('proceed_to_checkout', {}, page());
		const cartId = await cartWith([{ id: tote, quantity: 1 }]);
		const full = await call('proceed_to_checkout', {}, page(cartId));

		expect(empty.result.isError).toBe(true);
		expect(full.navigateTo).toBe(`${ORIGIN}/demo-checkout`);
		expect(full.structured).toMatchObject({ navigating_to: `${ORIGIN}/demo-checkout`, item_count: 1 });
	});

	it('adds this product variant to the cart', async () => {
		const outcome = await call(
			'add_to_cart',
			{ item: { id: fieldShirtM }, quantity: 2 },
			page(undefined, 'field-shirt'),
		);

		expect(outcome.cart?.totalQuantity).toBe(2);
		expect((outcome.structured as CartResult).line_items).toEqual([
			expect.objectContaining({ quantity: 2, item: expect.objectContaining({ id: fieldShirtM }) }),
		]);
	});
});

describe('store tools: add_to_cart scope', () => {
	it('refuses a variant of another product and works only on a product page', async () => {
		const otherProduct = await call(
			'add_to_cart',
			{ item: { id: tote }, quantity: 1 },
			page(undefined, 'field-shirt'),
		);
		const noProduct = await call('add_to_cart', { item: { id: tote }, quantity: 1 }, page());

		expect(otherProduct.result.isError).toBe(true);
		expect(otherProduct.result.content[0]?.text).toMatch(/not a variant of the product on this page/u);
		expect(noProduct.result.isError).toBe(true);
		expect(otherProduct.cartId).toBeUndefined();
	});
});

describe('store tools: input validation', () => {
	it('names the invalid field and changes nothing', async () => {
		const outcome = await call(
			'add_to_cart',
			{ item: { id: fieldShirtM }, quantity: 0 },
			page(undefined, 'field-shirt'),
		);

		expect(outcome.result.isError).toBe(true);
		expect(outcome.result.content[0]?.text).toMatch(/quantity/u);
		expect(outcome.cartId).toBeUndefined();
	});

	it('refuses a tool that does not exist on the surface', async () => {
		const outcome = await call('show_variant', { catalog: { handle: 'canvas-tote' } }, mcp);

		expect(outcome.result.isError).toBe(true);
	});
});

describe('store tools over /mcp', () => {
	it('acts on the cart named by id', async () => {
		const created = await call('create_cart', { cart: { line_items: [{ item: { id: tote }, quantity: 1 }] } }, mcp);
		const id = (created.structured as CartResult).id;

		const read = await call('get_cart', { id }, mcp);

		expect((read.structured as CartResult).line_items).toEqual([expect.objectContaining({ quantity: 1 })]);
	});

	it('asks for the cart id when none is given', async () => {
		const outcome = await call('get_cart', {}, mcp);

		expect(outcome.result.isError).toBe(true);
		expect(outcome.result.content[0]?.text).toMatch(/Pass id/u);
	});
});

describe('store tools: the cart a page shows an agent', () => {
	it('shows a revision, never the cart id', async () => {
		const cartId = await cartWith([{ id: tote, quantity: 1 }]);

		const read = await call('get_cart', {}, page(cartId));

		expect((read.structured as CartResult).id).toMatch(/^rev_/u);
		expect(JSON.stringify(read.result)).not.toContain(cartId);
	});

	it('detects a stale result when the provider keeps the cart id, as Shopify does', async () => {
		const stableIds: CommerceProvider = {
			...provider,
			getCart: async (id) => {
				const cart = await provider.getCart(id);
				return cart ? { ...cart, id: 'stable-cart' } : null;
			},
		};
		const first = await cartWith([{ id: tote, quantity: 1 }]);
		const context = (cartId: string): StoreToolContext => ({ ...page(cartId), provider: stableIds });
		const read = (await call('get_cart', {}, context(first))).structured as CartResult;
		const changed = await cartWith([{ id: tote, quantity: 2 }]);

		const outcome = await call('cancel_cart', { id: read.id }, context(changed));

		expect(outcome.cartId).toBeUndefined();
		expect((outcome.structured as CartResult).messages).toContainEqual(
			expect.objectContaining({ code: 'cart_changed' }),
		);
	});

	it('refuses a line id that no longer holds the listed item', async () => {
		const cartId = await cartWith([{ id: tote, quantity: 1 }]);
		const read = (await call('get_cart', {}, page(cartId))).structured as CartResult;
		const toteLine = read.line_items[0]?.id;

		const outcome = await call(
			'update_cart',
			{ id: read.id, cart: { line_items: [{ id: toteLine, item: { id: fieldShirtM }, quantity: 1 }] } },
			page(cartId),
		);

		expect(outcome.cartId).toBeUndefined();
		expect((outcome.structured as CartResult).messages).toContainEqual(
			expect.objectContaining({ code: 'cart_changed' }),
		);
	});

	it('refuses an id when the shopper has no cart', async () => {
		const outcome = await call('update_cart', { id: 'rev_old', cart: { line_items: [] } }, page());

		expect((outcome.structured as CartResult).messages).toContainEqual(
			expect.objectContaining({ code: 'cart_changed' }),
		);
	});

	it('adds on top of what the cart holds', async () => {
		const cartId = await cartWith([{ id: fieldShirtM, quantity: 1 }]);

		const outcome = await call(
			'add_to_cart',
			{ item: { id: fieldShirtM }, quantity: 2 },
			page(cartId, 'field-shirt'),
		);

		expect((outcome.structured as CartResult).line_items).toEqual([expect.objectContaining({ quantity: 3 })]);
	});
});

describe('store tools over /mcp: carts that do not exist', () => {
	it('reports an unknown cart id', async () => {
		const outcome = await call('get_cart', { id: 'demo-cart.unknown' }, mcp);

		expect(outcome.result.isError).toBe(true);
		expect(outcome.result.content[0]?.text).toMatch(/No cart with that id/u);
	});

	it('returns the checkout URL without navigating', async () => {
		const created = await call('create_cart', { cart: { line_items: [{ item: { id: tote }, quantity: 1 }] } }, mcp);

		const outcome = await call('proceed_to_checkout', { id: (created.structured as CartResult).id }, mcp);

		expect(outcome.navigateTo).toBeUndefined();
		expect(outcome.structured).toMatchObject({ navigating_to: `${ORIGIN}/demo-checkout` });
	});
});

describe('store tools: variant ids', () => {
	it('accepts the numeric tail of a variant id in add_to_cart, as show_variant does', async () => {
		const outcome = await call(
			'add_to_cart',
			{ item: { id: 'field-shirt-m' }, quantity: 1 },
			page(undefined, 'field-shirt'),
		);

		expect((outcome.structured as CartResult).line_items).toEqual([
			expect.objectContaining({ item: expect.objectContaining({ id: fieldShirtM }) }),
		]);
	});
});

describe('store tools: result size on a page', () => {
	const handles = ['field-shirt', 'linen-overshirt', 'trail-tee', 'canvas-tote', 'steel-bottle', 'merino-beanie'];

	it('keeps a search for "shirt" within the size Chrome recommends, with the products an agent needs to pick one', async () => {
		const { result } = await runStoreTool('search_catalog', { catalog: { query: 'shirt' } }, page());

		expect(result.content.map((entry) => entry.text).join('').length).toBeLessThanOrEqual(1500);
		expect(resultSize(result)).toBeLessThanOrEqual(1500);
		expect(result.structuredContent.products).toEqual([
			expect.objectContaining({
				handle: 'field-shirt',
				variant_id: 'gid://ecoshop/ProductVariant/field-shirt-s',
				price: '$68.00',
			}),
			expect.objectContaining({ handle: 'linen-overshirt' }),
			expect.objectContaining({ handle: 'trail-tee' }),
		]);
	});

	it('keeps every page result within the recommended size', async () => {
		const outcomes = [
			...(await Promise.all(
				['shirt', 'tote', 'bottle', 'shipping returns'].map((query) =>
					runStoreTool('search_catalog', { catalog: { query, pagination: { limit: 10 } } }, page()),
				),
			)),
			...(await Promise.all(
				handles.map((handle) => runStoreTool('get_product', { catalog: { id: handle } }, page())),
			)),
			await runStoreTool('browse_store', {}, page()),
			await runStoreTool('browse_store', { collection: 'all' }, page()),
			await runStoreTool('browse_store', { collection: 'apparel', page: 2 }, page()),
			await runStoreTool('ask_business', { ask: { query: 'What is your return and shipping policy?' } }, page()),
		];

		for (const { result } of outcomes) expect(resultSize(result)).toBeLessThanOrEqual(1500);
	});

	it('pages the products in full, a few at a time, and says whether more follow', async () => {
		const listed: string[] = [];
		for (let number = 1; ; number += 1) {
			const { structured } = await call('browse_store', { collection: 'all', page: number }, page());
			listed.push(...(structured.products as Array<{ handle: string }>).map((product) => product.handle));
			if (!structured.has_more) break;
		}
		const overMcp = await call('browse_store', { collection: 'all' }, mcp);

		expect(listed).toEqual(
			(overMcp.structured.products as Array<{ handle: string }>).map((product) => product.handle),
		);
		expect(listed.length).toBeGreaterThan(4);
	});

	it('names the products it left out of a result that would be too long', async () => {
		const longTitle = 'A product with a very long title that goes on and on '.repeat(3);
		const [base] = await provider.listProducts({ limit: 1 });
		if (!base) throw new Error('The demo catalog has products.');
		const crowded: CommerceProvider = {
			...provider,
			searchProducts: async () =>
				Array.from({ length: 10 }, (_, index) => ({
					...base,
					id: `gid://ecoshop/Product/p${index}`,
					handle: `product-${index}`,
					title: `${longTitle}${index}`,
				})),
		};

		const { result } = await runStoreTool(
			'search_catalog',
			{ catalog: { query: 'product', pagination: { limit: 10 } } },
			{ ...page(), provider: crowded },
		);

		expect(resultSize(result)).toBeLessThanOrEqual(1500);
		expect(result.structuredContent.products_not_shown).toBeGreaterThan(0);
		expect(result.content[0]?.text).toMatch(/shown to keep the result short/u);
	});

	it('keeps the full product shape over /mcp', async () => {
		const { structured } = await call('search_catalog', { catalog: { query: 'shirt' } }, mcp);

		expect(structured.products).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					price_range: expect.any(Object),
					options: expect.any(Array),
					vendor: expect.any(String),
				}),
			]),
		);
	});
});
