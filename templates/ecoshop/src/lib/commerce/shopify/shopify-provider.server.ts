import { CartInputError, CommerceBackendError } from '../errors';
import type { Cart, CartLineQuantity, Collection, CommerceProvider } from '../types';
import {
	type ShopifyCart,
	type ShopifyProduct,
	type ShopifyProductSummary,
	toCart,
	toProduct,
	toProductSummary,
} from './normalize';
import {
	CART_CREATE_MUTATION,
	CART_LINES_ADD_MUTATION,
	CART_LINES_REMOVE_MUTATION,
	CART_LINES_UPDATE_MUTATION,
	CART_QUERY,
	COLLECTION_QUERY,
	COLLECTIONS_QUERY,
	PRODUCT_QUERY,
	PRODUCTS_QUERY,
	SHOP_QUERY,
} from './queries';
import { createStorefrontClient, type StorefrontClientOptions } from './storefront-client.server';

const DEFAULT_LIMIT = 24;

type CartMutationResult = {
	cart: ShopifyCart | null;
	userErrors: Array<{ field: string[] | null; message: string }>;
	warnings: Array<{ code: string; message: string }>;
};

const CART_ID_PREFIX = 'gid://shopify/Cart/';
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
 * A commerce provider over the Shopify Storefront API.
 */
export function createShopifyProvider(options: StorefrontClientOptions): CommerceProvider {
	const query = createStorefrontClient(options);

	async function mutateCart(document: string, operation: string, variables: Record<string, unknown>): Promise<Cart> {
		const data = await query<Record<string, CartMutationResult>>(document, variables);
		const result = data[operation];
		const refusals = [
			...(result?.userErrors ?? []),
			...(result?.warnings ?? []).filter((warning) => warning.code === 'MERCHANDISE_OUT_OF_STOCK'),
		];
		if (refusals.length) {
			throw new CartInputError(refusals.map((problem) => problem.message).join('; '));
		}
		if (!result?.cart) {
			throw new CommerceBackendError(`${operation} returned no cart`);
		}
		return toCart(result.cart);
	}

	/**
	 * @remarks
	 * An id that is not a Shopify cart GID, such as a demo cart cookie left from before the store was connected,
	 * is no cart: the API would answer it with a top-level error.
	 */
	async function getCart(cartId: string): Promise<Cart | null> {
		if (!cartId.startsWith(CART_ID_PREFIX)) return null;
		const data = await query<{ cart: ShopifyCart | null }>(CART_QUERY, { id: cartId });
		return data.cart ? toCart(data.cart) : null;
	}

	const createCart = (lines: CartLineQuantity[]) =>
		mutateCart(CART_CREATE_MUTATION, 'cartCreate', {
			lines: lines
				.filter((line) => line.quantity > 0)
				.map((line) => ({ merchandiseId: line.variantId, quantity: line.quantity })),
		});

	return {
		kind: 'shopify',
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
		getProduct: async (handle) => {
			const data = await query<{ product: ShopifyProduct | null }>(PRODUCT_QUERY, { handle });
			return data.product ? toProduct(data.product) : null;
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
		getCart,
		addToCart: async (cartId, lines) => {
			assertVariantIds(lines);
			const existing = cartId ? await getCart(cartId) : null;
			if (!existing) return createCart(lines);
			return mutateCart(CART_LINES_ADD_MUTATION, 'cartLinesAdd', {
				cartId: existing.id,
				lines: lines.map((line) => ({ merchandiseId: line.variantId, quantity: line.quantity })),
			});
		},
		setCartQuantities: async (cartId, lines) => {
			assertVariantIds(lines);
			const existing = cartId ? await getCart(cartId) : null;
			if (!existing) return createCart(lines);

			const removals: string[] = [];
			const updates: Array<{ id: string; quantity: number }> = [];
			const additions: Array<{ merchandiseId: string; quantity: number }> = [];
			for (const { variantId, quantity } of lines) {
				const [first, ...duplicates] = existing.lines.filter((line) => line.variantId === variantId);
				removals.push(...duplicates.map((line) => line.id));
				if (first && quantity === 0) removals.push(first.id);
				else if (first) updates.push({ id: first.id, quantity });
				else if (quantity > 0) additions.push({ merchandiseId: variantId, quantity });
			}

			let cart = existing;
			if (removals.length) {
				cart = await mutateCart(CART_LINES_REMOVE_MUTATION, 'cartLinesRemove', {
					cartId: cart.id,
					lineIds: removals,
				});
			}
			if (updates.length) {
				cart = await mutateCart(CART_LINES_UPDATE_MUTATION, 'cartLinesUpdate', {
					cartId: cart.id,
					lines: updates,
				});
			}
			if (additions.length) {
				cart = await mutateCart(CART_LINES_ADD_MUTATION, 'cartLinesAdd', { cartId: cart.id, lines: additions });
			}
			return cart;
		},
	};
}
