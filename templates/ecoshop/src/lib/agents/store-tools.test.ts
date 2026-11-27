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

	it('changes the listed lines and keeps the ones it is not sent, and 0 removes a line', async () => {
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
			expect.objectContaining({ quantity: 1, item: expect.objectContaining({ id: tote }) }),
		]);

		const toteLine = (after.structured as CartResult).line_items.find((line) => line.item.id === tote);
		const removed = await call(
			'update_cart',
			{
				id: (after.structured as CartResult).id,
				cart: { line_items: [{ id: toteLine?.id, item: { id: tote }, quantity: 0 }] },
			},
			page(after.cartId),
		);

		expect((removed.structured as CartResult).line_items.map((line) => line.item.id)).toEqual([fieldShirtM]);
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

describe('store tools: a cart change the provider only partly made', () => {
	it('shows the agent the cart as it now is, with the provider message', async () => {
		const cartId = await cartWith([{ id: fieldShirtM, quantity: 1 }]);
		const before = (await call('get_cart', {}, page(cartId))).structured as CartResult;
		const current = await provider.setCartQuantities(cartId, [{ variantId: tote, quantity: 1 }]);
		const partly: CommerceProvider = {
			...provider,
			setCartQuantities: async () => ({
				...current,
				messages: [
					{
						type: 'error',
						code: 'change_incomplete',
						content:
							'The new items were added, but the rest of the change was refused: The line does not exist',
					},
				],
			}),
		};

		const outcome = await call(
			'update_cart',
			{ id: before.id, cart: { line_items: [{ item: { id: tote }, quantity: 1 }] } },
			{ ...page(cartId), provider: partly },
		);

		expect(outcome.result.isError).toBeUndefined();
		expect((outcome.structured as CartResult).line_items.map((line) => line.item.id)).toEqual([fieldShirtM, tote]);
		expect((outcome.structured as CartResult).messages).toEqual([
			expect.objectContaining({ type: 'error', code: 'change_incomplete' }),
		]);
		expect(outcome.result.content[0]?.text).toContain('the rest of the change was refused');
	});
});

describe('store tools: a quantity the store capped', () => {
	it('shows the agent the line at the stock, with a warning that says so', async () => {
		const cartId = await cartWith([{ id: tote, quantity: 2 }]);
		const before = (await call('get_cart', {}, page(cartId))).structured as CartResult;
		const line = before.line_items[0];

		const outcome = await call(
			'update_cart',
			{ id: before.id, cart: { line_items: [{ id: line?.id, item: { id: tote }, quantity: 5 }] } },
			page(cartId),
		);

		const view = outcome.structured as CartResult;
		expect(view.line_items).toEqual([expect.objectContaining({ quantity: 3 })]);
		expect(view.messages).toEqual([
			{
				type: 'warning',
				code: 'quantity_reduced',
				content: expect.stringContaining('only 3 in stock'),
			},
		]);
		expect(outcome.result.content[0]?.text).toContain('only 3 in stock');
	});

	it('tells the agent how many of an addition went in on a product page', async () => {
		const outcome = await call('add_to_cart', { item: { id: tote }, quantity: 5 }, page(undefined, 'canvas-tote'));

		expect((outcome.structured as CartResult).item_count).toBe(3);
		expect((outcome.structured as CartResult).messages).toEqual([
			expect.objectContaining({ type: 'warning', code: 'quantity_reduced' }),
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

describe('store tools: browse_store on a large catalog', () => {
	const catalog = async () => {
		const [base] = await provider.listProducts({ limit: 1 });
		if (!base) throw new Error('The demo catalog has products.');
		return Array.from({ length: 300 }, (_, index) => ({
			...base,
			id: `gid://ecoshop/Product/p${index + 1}`,
			handle: `product-${index + 1}`,
			title: `Product ${index + 1}`,
			priceRange: {
				min: { amount: String(index + 1), currencyCode: 'USD' },
				max: { amount: String(index + 1), currencyCode: 'USD' },
			},
		}));
	};

	it('asks the provider for the order and the page, and lists the page the provider returned', async () => {
		const products = await catalog();
		const asked: unknown[] = [];
		const large: CommerceProvider = {
			...provider,
			listProducts: async (options) => {
				asked.push(options);
				const sorted = [...products].sort(
					(a, b) => Number(a.priceRange.min.amount) - Number(b.priceRange.min.amount),
				);
				return sorted.slice(options?.offset ?? 0, (options?.offset ?? 0) + (options?.limit ?? 24));
			},
		};

		const { structured } = await call(
			'browse_store',
			{ collection: 'all', sort_by: 'price-ascending', page: 10 },
			{ ...mcp, provider: large },
		);

		expect(asked).toEqual([{ limit: 31, offset: 270, sort: 'price-ascending' }]);
		expect((structured.products as Array<{ handle: string }>).map((product) => product.handle)).toEqual(
			Array.from({ length: 30 }, (_, index) => `product-${271 + index}`),
		);
		expect(structured.has_more).toBe(false);
	});

	it('says whether a page follows without reading the whole catalog', async () => {
		const products = await catalog();
		const large: CommerceProvider = {
			...provider,
			listProducts: async (options) =>
				products.slice(options?.offset ?? 0, (options?.offset ?? 0) + (options?.limit ?? 24)),
		};

		const first = await call('browse_store', { collection: 'all', page: 1 }, { ...mcp, provider: large });
		const last = await call('browse_store', { collection: 'all', page: 10 }, { ...mcp, provider: large });

		expect(first.structured.has_more).toBe(true);
		expect(last.structured.has_more).toBe(false);
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
		for (let number = 1; number <= 20; number += 1) {
			const { structured } = await call('browse_store', { collection: 'all', page: number }, page());
			listed.push(...(structured.products as Array<{ handle: string }>).map((product) => product.handle));
			if (!structured.has_more) break;
		}
		expect(listed.length).toBeLessThan(80);
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

describe('store tools: results trimmed to fit a page', () => {
	const baseProduct = async () => {
		const product = await provider.getProduct('field-shirt');
		if (!product) throw new Error('The demo catalog has the Field Shirt.');
		return product;
	};

	it('drops the variants that do not fit and says how many, with a hint to narrow them', async () => {
		const product = await baseProduct();
		const crowded: CommerceProvider = {
			...provider,
			getProduct: async () => ({
				...product,
				description: 'A long description that goes on. '.repeat(40),
				variants: Array.from({ length: 30 }, (_, index) => ({
					...product.variants[0]!,
					id: `gid://ecoshop/ProductVariant/field-shirt-${index}`,
					title: `Size ${index}`,
				})),
			}),
		};

		const { result } = await runStoreTool(
			'get_product',
			{ catalog: { id: 'field-shirt' } },
			{ ...page(), provider: crowded },
		);

		expect(resultSize(result)).toBeLessThanOrEqual(1500);
		expect(result.structuredContent.variants_not_shown).toBeGreaterThan(0);
		expect(result.structuredContent.hint).toMatch(/selected_options/u);
		expect((result.structuredContent.description as string).length).toBeLessThanOrEqual(243);
		expect(result.structuredContent.description).toMatch(/\.\.\.$/u);
	});

	it('keeps the whole description of a short one and every variant that fits', async () => {
		const { structured } = await call('get_product', { catalog: { id: 'steel-bottle' } }, page());

		expect(structured.description).not.toMatch(/\.\.\.$/u);
		expect(structured).not.toHaveProperty('variants_not_shown');
	});

	it('lists as many collections as fit, and says there are more', async () => {
		const crowded: CommerceProvider = {
			...provider,
			listCollections: async () =>
				Array.from({ length: 40 }, (_, index) => ({
					id: `gid://ecoshop/Collection/c${index}`,
					handle: `collection-number-${index}`,
					title: `Collection number ${index}`,
					description: 'A collection.',
				})),
		};

		const { result } = await runStoreTool('browse_store', {}, { ...page(), provider: crowded });

		expect(resultSize(result)).toBeLessThanOrEqual(1500);
		expect((result.structuredContent.collections as unknown[]).length).toBeLessThan(40);
		expect(result.content[0]?.text).toMatch(/and more\.$/u);
	});
});

describe('store tools: cart and answer results on a page', () => {
	const lines = [
		{ id: fieldShirtM, quantity: 2 },
		{ id: tote, quantity: 1 },
		{ id: 'gid://ecoshop/ProductVariant/steel-bottle-750-ml', quantity: 1 },
		{ id: 'gid://ecoshop/ProductVariant/merino-beanie-charcoal', quantity: 3 },
	];

	it('keeps a cart of four lines within the recommended size, with every line', async () => {
		const cartId = await cartWith(lines);

		const { result, structured } = await call('get_cart', {}, page(cartId));

		expect(resultSize(result)).toBeLessThanOrEqual(1500);
		expect((structured as CartResult).line_items).toHaveLength(4);
		expect((structured as CartResult).line_items[0]).not.toHaveProperty('item.image');
	});

	it('keeps the full cart shape over /mcp', async () => {
		const created = await call(
			'create_cart',
			{ cart: { line_items: lines.map(({ id, quantity }) => ({ item: { id }, quantity })) } },
			mcp,
		);

		const line = (created.structured as CartResult).line_items[0] as unknown as {
			item: { handle: string; url: string; image: string; unit_price: unknown };
		};
		expect(line.item).toEqual(
			expect.objectContaining({ handle: expect.any(String), url: expect.any(String), image: expect.any(String) }),
		);
		expect(created.structured).toHaveProperty('totals');
		expect(created.structured).toHaveProperty('currency');
	});

	const crowdedPolicies = (): CommerceProvider => {
		const long = Array.from(
			{ length: 6 },
			(_, index) => `Returns paragraph ${index}. ${'We take returns within thirty days. '.repeat(20)}`,
		).join('\n\n');
		return {
			...provider,
			listPolicies: async () =>
				['refund_policy', 'shipping_policy', 'privacy_policy'].map((type, index) => ({
					handle: `${type}-with-a-rather-long-handle-${index}`,
					type: type as 'refund_policy',
					title: `A policy about returns and refunds number ${index}`,
					body: long,
				})),
		};
	};

	it('cuts the answer to a long question to what fits', async () => {
		const crowded = crowdedPolicies();
		const { result } = await runStoreTool(
			'ask_business',
			{ ask: { query: 'returns and refunds' } },
			{ ...page(), provider: crowded },
		);

		const text = result.content[0]?.text ?? '';
		expect(resultSize(result)).toBeLessThanOrEqual(1500);
		expect(text.match(/\(https:/gu)).toHaveLength(1);
		expect(text).toContain('Returns paragraph 0.');
		expect(text.length).toBeGreaterThan(250);
	});

	it('gives the full answer over /mcp', async () => {
		const { structured } = await call(
			'ask_business',
			{ ask: { query: 'returns and refunds' } },
			{ ...mcp, provider: crowdedPolicies() },
		);

		const plain = (structured.answer as { plain: string }).plain;
		expect(plain.match(/\(https?:/gu)).toHaveLength(3);
		expect(plain).toContain('Returns paragraph 1.');
		expect(plain.length).toBeGreaterThan(2500);
	});
});

describe('store tools: a long cart on a page', () => {
	const variants = [
		'gid://ecoshop/ProductVariant/field-shirt-s',
		'gid://ecoshop/ProductVariant/field-shirt-m',
		'gid://ecoshop/ProductVariant/field-shirt-l',
		'gid://ecoshop/ProductVariant/trail-tee-s',
		'gid://ecoshop/ProductVariant/trail-tee-m',
		'gid://ecoshop/ProductVariant/trail-tee-l',
		'gid://ecoshop/ProductVariant/canvas-tote',
		'gid://ecoshop/ProductVariant/steel-bottle-500-ml',
		'gid://ecoshop/ProductVariant/steel-bottle-750-ml',
		'gid://ecoshop/ProductVariant/merino-beanie-charcoal',
	];

	/**
	 * A provider whose cart has `count` lines with long titles, which the demo catalog is too small to make.
	 */
	const cartOf = (count: number): { provider: CommerceProvider; cartId: string } => {
		const lines = Array.from({ length: count }, (_, index) => ({
			id: `gid://shopify/CartLine/${'a'.repeat(40)}${index}?cart=${'k'.repeat(30)}`,
			quantity: index + 1,
			variantId: `gid://shopify/ProductVariant/${4470000000000 + index}`,
			variantTitle: `A variant title that is long ${index}`.repeat(4),
			productHandle: `product-${index}`,
			productTitle: `A product with a very long title ${index} `.repeat(8),
			unitPrice: { amount: '10.00', currencyCode: 'USD' },
			totalPrice: { amount: '10.00', currencyCode: 'USD' },
			image: null,
		}));
		const cart = {
			id: 'gid://shopify/Cart/long',
			checkoutUrl: '/checkout',
			totalQuantity: lines.length,
			subtotal: { amount: '10.00', currencyCode: 'USD' },
			lines,
		};
		return { provider: { ...provider, getCart: async () => cart }, cartId: cart.id };
	};

	it.each([1, 10, 50])('fits a cart of %i lines, and every line can be read by paging', async (count) => {
		const { provider: long, cartId } = cartOf(count);
		const seen: string[] = [];
		let offset: number | undefined;

		for (let step = 0; step < count + 1; step += 1) {
			const { result, structured } = await call('get_cart', offset === undefined ? {} : { offset }, {
				...page(cartId),
				provider: long,
			});
			expect(resultSize(result)).toBeLessThanOrEqual(1500);
			seen.push(...(structured.line_items as Array<{ id: string }>).map((line) => line.id));
			if (!structured.has_more) break;
			offset = structured.next_offset as number;
		}

		expect(seen).toHaveLength(count);
		expect(new Set(seen).size).toBe(count);
	});

	it('says how many lines there are and where to read on', async () => {
		const { provider: long, cartId } = cartOf(10);

		const { structured, result } = await call('get_cart', {}, { ...page(cartId), provider: long });

		expect(structured).toMatchObject({ line_count: 10, offset: 0, has_more: true });
		expect(structured.next_offset).toBeGreaterThan(0);
		expect(result.content[0]?.text).toMatch(/10 lines in all; get_cart with offset \d+ shows the rest/u);
	});

	it('shows fewer lines when asked for fewer, and starts where it is told', async () => {
		const { provider: long, cartId } = cartOf(10);

		const { structured } = await call('get_cart', { offset: 4, limit: 1 }, { ...page(cartId), provider: long });

		expect(structured).toMatchObject({ offset: 4, has_more: true, next_offset: 5 });
		expect((structured.line_items as unknown[]).length).toBe(1);
	});

	it('keeps the lines it did not show when update_cart changes the ones it is sent', async () => {
		const created = await call(
			'create_cart',
			{
				cart: {
					line_items: variants
						.map((id) => ({ item: { id }, quantity: 1 }))
						.filter((line) => !line.item.id.includes('linen')),
				},
			},
			page(),
		);
		const view = created.structured as CartResult & { line_count: number; has_more?: boolean };
		const first = view.line_items[0];

		const updated = await call(
			'update_cart',
			{ id: view.id, cart: { line_items: [{ id: first?.id, item: { id: first?.item.id ?? '' }, quantity: 2 }] } },
			page(created.cartId),
		);

		const after = updated.structured as CartResult & { line_count: number };
		expect(after.line_count).toBe(view.line_count);
		expect(resultSize(updated.result)).toBeLessThanOrEqual(1500);
		expect(after.item_count).toBe(view.item_count + 1);
	});

	it('returns the whole cart over /mcp, whatever its length', async () => {
		const created = await call(
			'create_cart',
			{ cart: { line_items: variants.map((id) => ({ item: { id }, quantity: 1 })) } },
			mcp,
		);

		expect((created.structured as CartResult).line_items).toHaveLength(variants.length);
		expect(created.structured).not.toHaveProperty('has_more');
	});
});

describe('store tools: titles and headings that run on', () => {
	const longTitle = `${'A title that goes on and on '.repeat(11)}end`;
	const longHandle = `${'a-handle-that-is-long-'.repeat(8)}end`;

	const crowded = async (): Promise<CommerceProvider> => {
		const product = await provider.getProduct('field-shirt');
		const [summary] = await provider.listProducts({ limit: 1 });
		if (!product || !summary) throw new Error('The demo catalog has the Field Shirt.');
		const longProduct = { ...product, title: longTitle, handle: longHandle };
		const longSummary = { ...summary, title: longTitle, handle: longHandle };
		return {
			...provider,
			getProduct: async () => longProduct,
			listProducts: async (options) =>
				Array.from({ length: 40 }, (_, index) => ({
					...longSummary,
					id: `p${index}`,
					handle: `${longHandle}-${index}`,
				})).slice(options?.offset ?? 0, (options?.offset ?? 0) + (options?.limit ?? 24)),
			searchProducts: async (_query, options) =>
				Array.from({ length: options?.limit ?? 5 }, (_, index) => ({
					...longSummary,
					id: `p${index}`,
					handle: `${longHandle}-${index}`,
				})),
			listCollections: async () =>
				Array.from({ length: 12 }, (_, index) => ({
					id: `c${index}`,
					handle: `${longHandle}-${index}`,
					title: longTitle,
					description: longTitle,
				})),
			getCollection: async (_handle, options) => ({
				collection: { id: 'c', handle: longHandle, title: longTitle, description: '' },
				products: Array.from({ length: 40 }, (_, index) => ({
					...longSummary,
					id: `p${index}`,
					handle: `${longHandle}-${index}`,
				})).slice(options?.offset ?? 0, (options?.offset ?? 0) + (options?.limit ?? 24)),
			}),
			listPolicies: async () =>
				['refund_policy', 'shipping_policy', 'privacy_policy'].map((type, index) => ({
					handle: `${longHandle}-${index}`,
					type: type as 'refund_policy',
					title: `${longTitle} returns and refunds`,
					body: `Returns come first. ${'Returns and refunds are taken within thirty days. '.repeat(30)}`,
				})),
		};
	};

	it('fits every page result when a title is 300 characters and a handle is 180', async () => {
		const long = await crowded();
		const context = { ...page(undefined, longHandle), provider: long };

		const results = await Promise.all([
			runStoreTool('search_catalog', { catalog: { query: 'title returns', pagination: { limit: 10 } } }, context),
			runStoreTool('get_product', { catalog: { id: longHandle } }, context),
			runStoreTool('browse_store', {}, context),
			runStoreTool('browse_store', { collection: 'all' }, context),
			runStoreTool('browse_store', { collection: 'some-collection' }, context),
			runStoreTool('ask_business', { ask: { query: 'returns and refunds' } }, context),
		]);

		for (const { result } of results) expect(resultSize(result)).toBeLessThanOrEqual(1500);
	});

	it('still reaches every product of a long listing by following next_offset', async () => {
		const long = await crowded();
		const handles: string[] = [];
		let offset: number | undefined;

		for (let step = 0; step < 60; step += 1) {
			const { result, structured } = await call(
				'browse_store',
				offset === undefined ? { collection: 'all' } : { collection: 'all', offset },
				{ ...page(), provider: long },
			);
			expect(resultSize(result)).toBeLessThanOrEqual(1500);
			handles.push(...(structured.products as Array<{ handle: string }>).map((product) => product.handle));
			if (!structured.has_more) break;
			offset = structured.next_offset as number;
		}

		expect(handles).toHaveLength(40);
		expect(new Set(handles).size).toBe(40);
	});

	it('clips the heading and gives the link when no paragraph fits', async () => {
		const long = await crowded();

		const { result } = await runStoreTool(
			'ask_business',
			{ ask: { query: 'returns and refunds' } },
			{ ...page(), provider: long },
		);

		const links = result.structuredContent.links as Array<{ title: string; url: string }>;
		expect(links[0]?.title.length).toBeLessThanOrEqual(63);
		expect(links[0]?.url).toContain(longHandle);
		expect(resultSize(result)).toBeLessThanOrEqual(1500);
	});

	it('leaves the titles whole over /mcp', async () => {
		const long = await crowded();

		const { structured } = await call(
			'search_catalog',
			{ catalog: { query: 'title' } },
			{ ...mcp, provider: long },
		);

		expect((structured.products as Array<{ title: string }>)[0]?.title).toBe(longTitle);
	});
});

describe('store tools: results that run on in every part', () => {
	const productWith = async (options: Array<{ name: string; values: string[] }>) => {
		const product = await provider.getProduct('field-shirt');
		if (!product) throw new Error('The demo catalog has the Field Shirt.');
		return { ...product, options };
	};

	it('returns the option names and values whole, as an agent passes them back as selected_options', async () => {
		const name = 'An option name of seventy characters, which is longer than a title clip'.slice(0, 70);
		const value = 'A value of seventy characters, which is longer than a title clip, too!'.slice(0, 70);
		const product = await productWith([{ name, values: [value] }]);

		const { structured } = await call(
			'get_product',
			{ catalog: { id: 'field-shirt' } },
			{ ...page(), provider: { ...provider, getProduct: async () => product } },
		);

		expect(structured.options).toEqual([{ name, values: [value] }]);
	});

	it('leaves out the options, and says so, when they would not fit with even one variant', async () => {
		const wide = Array.from({ length: 3 }, (_, option) => ({
			name: `Option ${option}`,
			values: Array.from({ length: 8 }, (_, value) =>
				`${'A long value '.repeat(5)}${option}${value}`.slice(0, 60),
			),
		}));
		const product = await productWith(wide);

		const { result, structured } = await call(
			'get_product',
			{ catalog: { id: 'field-shirt' } },
			{ ...page(), provider: { ...provider, getProduct: async () => product } },
		);

		expect(resultSize(result)).toBeLessThanOrEqual(1500);
		expect(structured.options_omitted ?? structured.options_truncated).toBe(true);
		expect(structured.variants).not.toHaveLength(0);
	});

	it('shrinks the messages of a cart when one line with long titles still does not fit', async () => {
		const line = (index: number) => ({
			id: `gid://shopify/CartLine/${index}`,
			quantity: 1,
			variantId: `gid://shopify/ProductVariant/${index}`,
			variantTitle: 'A variant title that is long '.repeat(4),
			productHandle: `product-${index}`,
			productTitle: 'A long product title '.repeat(15),
			unitPrice: { amount: '10.00', currencyCode: 'USD' },
			totalPrice: { amount: '10.00', currencyCode: 'USD' },
			image: null,
		});
		const lines = [line(1), line(2), line(3)];
		const cart = {
			id: 'gid://shopify/Cart/long',
			checkoutUrl: '/checkout',
			totalQuantity: 3,
			subtotal: { amount: '30.00', currencyCode: 'USD' },
			lines,
			messages: lines.map((entry) => ({
				type: 'warning' as const,
				code: 'quantity_reduced',
				content: `${entry.productTitle}: only 1 in stock, so the cart holds 1 instead of 2.`,
				variantId: entry.variantId,
				wanted: 2,
			})),
		};

		const { result } = await runStoreTool(
			'create_cart',
			{ cart: { line_items: lines.map((entry) => ({ item: { id: entry.variantId }, quantity: 2 })) } },
			{ ...page(), provider: { ...provider, setCartQuantities: async () => cart } },
		);

		expect(resultSize(result)).toBeLessThanOrEqual(1500);
		expect(result.structuredContent.line_items).toHaveLength(1);
	});

	it('gives the heading alone when the link of a policy would not fit, as with a handle that percent-encodes long', async () => {
		const crowded: CommerceProvider = {
			...provider,
			listPolicies: async () => [
				{
					handle: '\u754c'.repeat(180),
					type: 'refund_policy',
					title: 'Returns and refunds',
					body: 'Returns are taken within thirty days.',
				},
			],
		};

		const { result } = await runStoreTool(
			'ask_business',
			{ ask: { query: 'returns refunds' } },
			{ ...page(), provider: crowded },
		);

		expect(resultSize(result)).toBeLessThanOrEqual(1500);
		expect(result.content[0]?.text).toContain('Returns and refunds');
	});

	it('drops the links of a product whose handle percent-encodes long', async () => {
		const [summary] = await provider.listProducts({ limit: 1 });
		if (!summary) throw new Error('The demo catalog has products.');
		const long = { ...summary, handle: '\u754c'.repeat(180) };
		const crowded: CommerceProvider = {
			...provider,
			searchProducts: async () => [long],
			listProducts: async () => [long],
		};

		const searched = await runStoreTool(
			'search_catalog',
			{ catalog: { query: 'shirt' } },
			{ ...page(), provider: crowded },
		);
		const browsed = await runStoreTool('browse_store', { collection: 'all' }, { ...page(), provider: crowded });

		expect(resultSize(searched.result)).toBeLessThanOrEqual(1500);
		expect(resultSize(browsed.result)).toBeLessThanOrEqual(1500);
	});
});

describe('store tools: a collection whose handle percent-encodes long', () => {
	it('fits a browse that opens it, without the address in the text', async () => {
		const [summary] = await provider.listProducts({ limit: 1 });
		if (!summary) throw new Error('The demo catalog has products.');
		const handle = '\u754c'.repeat(180);
		const crowded: CommerceProvider = {
			...provider,
			getCollection: async () => ({
				collection: { id: 'c', handle, title: 'Everything', description: '' },
				products: [summary],
			}),
		};

		const { result, navigateTo } = await runStoreTool(
			'browse_store',
			{ collection: handle, navigate: true },
			{ ...page(), provider: crowded },
		);

		expect(resultSize(result)).toBeLessThanOrEqual(1500);
		expect(navigateTo).toContain('/collections/');
	});
});
