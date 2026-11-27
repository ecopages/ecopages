import { CartInputError, CommerceBackendError } from '../errors';
import {
	type Cart,
	type CartLineQuantity,
	type Collection,
	type CommerceProvider,
	MAX_LINE_QUANTITY,
	type StorePolicyType,
} from '../types';
import {
	type ShopifyCart,
	type ShopifyCartLine,
	type ShopifyConnection,
	type ShopifyProduct,
	type ShopifyProductSummary,
	type ShopifyVariant,
	toCart,
	toProduct,
	toProductSummary,
} from './normalize';
import {
	CART_CREATE_MUTATION,
	CART_LINES_QUERY,
	CART_QUERY,
	CART_STATE_QUERY,
	CART_CHANGE_FIELDS,
	type CartChangeField,
	cartChangeMutation,
	COLLECTION_QUERY,
	COLLECTIONS_QUERY,
	PRODUCT_BY_ID_QUERY,
	PRODUCT_QUERY,
	PRODUCT_VARIANTS_QUERY,
	PRODUCTS_QUERY,
	SHOP_POLICIES_QUERY,
	SHOP_QUERY,
} from './queries';
import { createStorefrontClient, type StorefrontClientOptions } from './storefront-client.server';

const DEFAULT_LIMIT = 24;

type CartMutationResult = {
	cart: ShopifyCart | null;
	userErrors: Array<{ field: string[] | null; message: string }>;
	warnings: Array<{ code: string; message: string }>;
};

type CartLineInput = { merchandiseId: string; quantity: number };

/**
 * Line changes, named by the variables of `cartChangeMutation`.
 */
type CartChange = { add: CartLineInput[]; update: Array<{ id: string; quantity: number }>; remove: string[] };

/**
 * The line changes that make a cart hold `lines`. A line already at its quantity is left alone.
 */
function planCartChange(cart: Cart, lines: CartLineQuantity[]): CartChange {
	const remove: string[] = [];
	const update: CartChange['update'] = [];
	const add: CartLineInput[] = [];
	for (const { variantId, quantity } of lines) {
		const [first, ...duplicates] = cart.lines.filter((line) => line.variantId === variantId);
		remove.push(...duplicates.map((line) => line.id));
		if (!first) {
			if (quantity > 0) add.push({ merchandiseId: variantId, quantity });
		} else if (quantity === 0) remove.push(first.id);
		else if (quantity !== first.quantity) update.push({ id: first.id, quantity });
	}
	return { add, update, remove };
}

/**
 * How many of each added variant `cart` holds before the addition.
 */
function heldBefore(cart: Cart | null, add: CartLineInput[] = []): Map<string, number> {
	const lines = cart?.lines ?? [];
	return new Map(
		add.map(({ merchandiseId }) => [
			merchandiseId,
			lines.filter((line) => line.variantId === merchandiseId).reduce((sum, line) => sum + line.quantity, 0),
		]),
	);
}

const CART_ID_PREFIX = 'gid://shopify/Cart/';

const PRODUCT_ID_PREFIX = 'gid://shopify/Product/';

type ShopifyPolicy = { handle: string; title: string; body: string };

const POLICY_FIELDS: Array<[string, StorePolicyType]> = [
	['refundPolicy', 'refund_policy'],
	['shippingPolicy', 'shipping_policy'],
	['privacyPolicy', 'privacy_policy'],
	['termsOfService', 'terms_of_service'],
];

/**
 * Named entities common in Shopify policy text. `&amp;` is decoded last, so `&amp;lt;` stays `&lt;`.
 */
const NAMED_ENTITIES: Record<string, string> = {
	nbsp: ' ',
	rsquo: '\u2019',
	lsquo: '\u2018',
	rdquo: '\u201D',
	ldquo: '\u201C',
	mdash: '\u2014',
	ndash: '\u2013',
	hellip: '\u2026',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
};

/**
 * Turns a policy's HTML body into the plain text the storefront renders and agents read.
 *
 * @remarks
 * Policies are the merchant's own content, but the storefront renders text, never store HTML, so a pasted script
 * or style can never run on the page.
 */
export function htmlToText(html: string): string {
	return html
		.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/giu, '')
		.replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/giu, '\n\n')
		.replace(/<[^>]+>/gu, '')
		.replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/giu, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
		.replace(/&([a-z]+);/gu, (match, name: string) => NAMED_ENTITIES[name] ?? match)
		.replace(/&amp;/gu, '&')
		.split(/\n\s*\n/u)
		.map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim())
		.filter(Boolean)
		.join('\n\n');
}
const VARIANT_ID_PREFIX = 'gid://shopify/ProductVariant/';

/**
 * Refuses a variant id that is not a Shopify variant GID before it reaches the API, which would answer with a
 * top-level GraphQL error instead of a cart error.
 */
function assertVariantIds(lines: CartLineQuantity[]): void {
	const invalid = lines.find((line) => !line.variantId.startsWith(VARIANT_ID_PREFIX));
	if (invalid) throw new CartInputError(`Unknown variant: ${invalid.variantId}`);
}

/**
 * Refuses a change that would take a line past {@link MAX_LINE_QUANTITY}.
 *
 * @remarks
 * An addition counts what `existing` already holds of the variant plus every requested entry for it, so repeating a
 * variant in one call cannot pass the cap. A set replaces the quantity, so each entry is checked on its own, and a
 * variant listed twice is refused, since Shopify would add the two entries up.
 */
function assertWithinCap(lines: CartLineQuantity[], existing: Cart | null, mode: 'add' | 'set'): void {
	const totals = new Map<string, number>();
	for (const { variantId, quantity } of lines) {
		if (mode === 'set' && totals.has(variantId)) throw new CartInputError(`${variantId} is listed twice.`);
		const base =
			mode === 'set'
				? 0
				: (totals.get(variantId) ??
					(existing?.lines ?? [])
						.filter((line) => line.variantId === variantId)
						.reduce((sum, line) => sum + line.quantity, 0));
		const total = base + quantity;
		if (total > MAX_LINE_QUANTITY) {
			throw new CartInputError(`A cart line holds at most ${MAX_LINE_QUANTITY} of one variant.`);
		}
		totals.set(variantId, total);
	}
}

/**
 * A commerce provider over the Shopify Storefront API.
 *
 * @remarks
 * `setCartQuantities` on an existing cart reads it and the stock of every variant it keeps in one request, refuses a
 * sold-out or unknown variant it would add before anything changes, then writes in at most two requests (see
 * `changeCart`). A new cart is created in one request, refused afterwards when Shopify added nothing. `addToCart` reads
 * the cart first for the line cap of 99. The Storefront API has no transaction or conditional write, so a change made
 * elsewhere between the read and the write is not seen: the cart a write returns is checked against the cap again
 * (`enforceCap`), and a refused second write returns the cart as it now is with a message (`changeCart`).
 */
export function createShopifyProvider(options: StorefrontClientOptions): CommerceProvider {
	const query = createStorefrontClient(options);

	/**
	 * Reads the pages after the first one of a connection, so a long variant list or cart is never cut short.
	 */
	async function remainingNodes<T>(
		first: ShopifyConnection<T>,
		nextPage: (after: string) => Promise<ShopifyConnection<T> | null>,
	): Promise<T[]> {
		const nodes = [...first.nodes];
		let pageInfo = first.pageInfo;
		while (pageInfo.hasNextPage && pageInfo.endCursor) {
			const page = await nextPage(pageInfo.endCursor);
			if (!page) break;
			nodes.push(...page.nodes);
			pageInfo = page.pageInfo;
		}
		return nodes;
	}

	async function completeCart(cart: ShopifyCart): Promise<Cart> {
		const nodes = await remainingNodes<ShopifyCartLine>(cart.lines, async (after) => {
			const data = await query<{ cart: { lines: ShopifyConnection<ShopifyCartLine> } | null }>(CART_LINES_QUERY, {
				id: cart.id,
				after,
			});
			return data.cart?.lines ?? null;
		});
		return toCart({ ...cart, lines: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } });
	}

	/**
	 * Runs a cart mutation and refuses it when Shopify did: `userErrors` in any of its fields, or an added variant the
	 * cart holds no more of than it did `before`.
	 *
	 * @remarks
	 * Since API 2024-07 a sold-out variant comes back as a `warnings` entry, not a user error, and the cart holds no
	 * more of it. A warning can also be about another line already in the cart, so only an addition that added nothing
	 * refuses the change; the warnings explain why.
	 */
	async function runCartMutation(
		document: string,
		variables: Record<string, unknown>,
		fields: readonly string[],
		before: Map<string, number>,
	): Promise<Cart> {
		const data = await query<Record<string, CartMutationResult>>(document, variables);
		const results = fields.map((field) => data[field]);
		const userErrors = results.flatMap((result) => result?.userErrors ?? []);
		if (userErrors.length) throw new CartInputError(userErrors.map((problem) => problem.message).join('; '));
		const last = results.at(-1)?.cart;
		if (!last) throw new CommerceBackendError(`${fields.join(', ')} returned no cart`);
		const cart = await completeCart(last);
		const missing = [...before]
			.filter(
				([variantId, held]) =>
					cart.lines
						.filter((line) => line.variantId === variantId)
						.reduce((sum, line) => sum + line.quantity, 0) <= held,
			)
			.map(([variantId]) => variantId);
		if (missing.length) {
			const reasons = results.flatMap((result) => result?.warnings ?? []).map((warning) => warning.message);
			throw new CartInputError(reasons.length ? reasons.join('; ') : `Could not add ${missing.join(', ')}.`);
		}
		return cart;
	}

	/**
	 * Reads a cart and which of `variants` are on sale. An id that is not a Shopify cart is no cart.
	 */
	async function readCartState(
		cartId: string | undefined,
		variants: string[],
	): Promise<{ cart: Cart | null; unavailable: string[] }> {
		if (!cartId?.startsWith(CART_ID_PREFIX)) return { cart: null, unavailable: [] };
		const data = await query<{
			cart: ShopifyCart | null;
			variants: Array<{ id?: string; availableForSale?: boolean } | null>;
		}>(CART_STATE_QUERY, { id: cartId, variants });
		const onSale = new Set(
			data.variants.flatMap((variant) => (variant?.id && variant.availableForSale ? [variant.id] : [])),
		);
		return {
			cart: data.cart ? await completeCart(data.cart) : null,
			unavailable: variants.filter((variantId) => !onSale.has(variantId)),
		};
	}

	function sendCartChange(cart: Cart, change: Partial<CartChange>): Promise<Cart> {
		const names = CART_CHANGE_FIELDS.map((entry) => entry.name).filter(
			(name: CartChangeField) => (change[name]?.length ?? 0) > 0,
		);
		const variables = Object.fromEntries(names.map((name) => [name, change[name]]));
		return runCartMutation(
			cartChangeMutation(names),
			{ cartId: cart.id, ...variables },
			names,
			heldBefore(cart, change.add),
		);
	}

	/**
	 * Applies a change in at most two requests: the additions, then the updates and removals together.
	 *
	 * @remarks
	 * Shopify runs every field of a mutation even after one reports an error, so a refused addition sent with the
	 * removals would still remove lines. Sent first and alone, a refused addition changes nothing. A refusal of the
	 * second request comes after the additions are in the cart, so the cart is read again and returned as it now is,
	 * with a message that says which changes were not made, instead of an error that hides the additions.
	 */
	async function changeCart(cart: Cart, { add, update, remove }: CartChange): Promise<Cart> {
		const added = add.length ? await sendCartChange(cart, { add }) : cart;
		if (!update.length && !remove.length) return added;
		try {
			return await sendCartChange(added, { update, remove });
		} catch (error) {
			if (!add.length || !(error instanceof CartInputError)) throw error;
			const current = await getCart(cart.id).catch(() => null);
			if (!current) throw error;
			return {
				...current,
				messages: [
					{
						type: 'error',
						code: 'change_incomplete',
						content: `The new items were added, but the rest of the change was refused: ${error.message} The cart is as it now is.`,
					},
				],
			};
		}
	}

	/**
	 * Takes a line that a change from another tab pushed past {@link MAX_LINE_QUANTITY} back to it.
	 *
	 * @remarks
	 * The cap is checked before a write from the cart that was read, and the Storefront API has no conditional write,
	 * so two tabs that each add one unit to a line of 98 both pass the check and Shopify merges them into 100. The
	 * cart a write returns is the one it ended with, so the check runs again on it.
	 */
	async function enforceCap(cart: Cart): Promise<Cart> {
		const over = cart.lines.filter((line) => line.quantity > MAX_LINE_QUANTITY);
		if (!over.length) return cart;
		const capped = await sendCartChange(cart, {
			update: over.map((line) => ({ id: line.id, quantity: MAX_LINE_QUANTITY })),
		});
		return {
			...capped,
			messages: [
				...(cart.messages ?? []),
				{
					type: 'warning',
					code: 'quantity_capped',
					content: `A cart line holds at most ${MAX_LINE_QUANTITY} of one variant, so ${over
						.map((line) => line.productTitle)
						.join(', ')} was set back to ${MAX_LINE_QUANTITY}.`,
				},
			],
		};
	}

	/**
	 * @remarks
	 * An id that is not a Shopify cart GID, such as a demo cart cookie left from before the store was connected,
	 * is no cart: the API would answer it with a top-level error.
	 */
	async function getCart(cartId: string): Promise<Cart | null> {
		if (!cartId.startsWith(CART_ID_PREFIX)) return null;
		const data = await query<{ cart: ShopifyCart | null }>(CART_QUERY, { id: cartId });
		return data.cart ? completeCart(data.cart) : null;
	}

	const createCart = (lines: CartLineQuantity[]) => {
		const add = lines
			.filter((line) => line.quantity > 0)
			.map((line) => ({ merchandiseId: line.variantId, quantity: line.quantity }));
		return runCartMutation(CART_CREATE_MUTATION, { lines: add }, ['cartCreate'], heldBefore(null, add));
	};

	return {
		getStore: async () => {
			const data = await query<{ shop: { name: string; description: string | null } }>(SHOP_QUERY);
			return { name: data.shop.name, description: data.shop.description ?? '' };
		},
		listProducts: async (list) => {
			const data = await query<{ products: { nodes: ShopifyProductSummary[] } }>(PRODUCTS_QUERY, {
				first: list?.limit ?? DEFAULT_LIMIT,
				sortKey: 'BEST_SELLING',
			});
			return data.products.nodes.map(toProductSummary);
		},
		searchProducts: async (text, list) => {
			const data = await query<{ products: { nodes: ShopifyProductSummary[] } }>(PRODUCTS_QUERY, {
				first: list?.limit ?? DEFAULT_LIMIT,
				query: text,
				sortKey: 'RELEVANCE',
			});
			return data.products.nodes.map(toProductSummary);
		},
		getProduct: async (handleOrId) => {
			const data = handleOrId.startsWith(PRODUCT_ID_PREFIX)
				? await query<{ product: ShopifyProduct | null }>(PRODUCT_BY_ID_QUERY, { id: handleOrId })
				: await query<{ product: ShopifyProduct | null }>(PRODUCT_QUERY, { handle: handleOrId });
			if (!data.product) return null;
			const { handle } = data.product;
			const variants = await remainingNodes<ShopifyVariant>(data.product.variants, async (after) => {
				const page = await query<{ product: { variants: ShopifyConnection<ShopifyVariant> } | null }>(
					PRODUCT_VARIANTS_QUERY,
					{ handle, after },
				);
				return page.product?.variants ?? null;
			});
			return toProduct({
				...data.product,
				variants: { nodes: variants, pageInfo: data.product.variants.pageInfo },
			});
		},
		listCollections: async (list) => {
			const data = await query<{ collections: { nodes: Collection[] } }>(COLLECTIONS_QUERY, {
				first: list?.limit ?? DEFAULT_LIMIT,
			});
			return data.collections.nodes;
		},
		getCollection: async (handle, list) => {
			const data = await query<{
				collection: (Collection & { products: { nodes: ShopifyProductSummary[] } }) | null;
			}>(COLLECTION_QUERY, { handle, first: list?.limit ?? DEFAULT_LIMIT });
			if (!data.collection) return null;
			const { products, ...collection } = data.collection;
			return { collection, products: products.nodes.map(toProductSummary) };
		},
		listPolicies: async () => {
			const data = await query<{ shop: Record<string, ShopifyPolicy | null> }>(SHOP_POLICIES_QUERY);
			return POLICY_FIELDS.flatMap(([field, type]) => {
				const policy = data.shop[field];
				return policy
					? [{ handle: policy.handle, type, title: policy.title, body: htmlToText(policy.body) }]
					: [];
			});
		},
		getCart,
		addToCart: async (cartId, lines) => {
			assertVariantIds(lines);
			const cart = cartId ? await getCart(cartId) : null;
			assertWithinCap(lines, cart, 'add');
			if (!cart) return createCart(lines);
			return enforceCap(
				await sendCartChange(cart, {
					add: lines.map((line) => ({ merchandiseId: line.variantId, quantity: line.quantity })),
				}),
			);
		},
		setCartQuantities: async (cartId, lines) => {
			assertVariantIds(lines);
			assertWithinCap(lines, null, 'set');
			const wanted = lines.filter((line) => line.quantity > 0).map((line) => line.variantId);
			const { cart, unavailable } = await readCartState(cartId, wanted);
			if (!cart) return createCart(lines);

			const change = planCartChange(cart, lines);
			const refused = change.add.filter((line) => unavailable.includes(line.merchandiseId));
			if (refused.length) {
				throw new CartInputError(
					`These variants are sold out or do not exist: ${refused.map((line) => line.merchandiseId).join(', ')}.`,
				);
			}
			return enforceCap(await changeCart(cart, change));
		},
	};
}
