/**
 * The storefront's commerce model. Pages, cart endpoints and MCP tools only see these shapes, so a provider can
 * be swapped without touching them.
 *
 * @remarks
 * Money keeps the Storefront API's decimal string so no provider rounds an amount through a float.
 *
 * @module
 */

export interface Money {
	amount: string;
	currencyCode: string;
}

export interface Image {
	/** Absolute, or root-relative to the store; pass it through `resolveUrl` before it leaves the site. */
	url: string;
	altText: string | null;
	width: number | null;
	height: number | null;
}

export interface SelectedOption {
	name: string;
	value: string;
}

export interface ProductOption {
	name: string;
	values: string[];
}

export interface ProductVariant {
	id: string;
	title: string;
	availableForSale: boolean;
	price: Money;
	compareAtPrice: Money | null;
	selectedOptions: SelectedOption[];
}

export interface ProductSummary {
	id: string;
	handle: string;
	title: string;
	vendor: string;
	availableForSale: boolean;
	priceRange: { min: Money; max: Money };
	featuredImage: Image | null;
}

export interface Product extends ProductSummary {
	description: string;
	productType: string;
	tags: string[];
	options: ProductOption[];
	variants: ProductVariant[];
	images: Image[];
}

export interface Collection {
	id: string;
	handle: string;
	title: string;
	description: string;
}

export interface CollectionWithProducts {
	collection: Collection;
	products: ProductSummary[];
}

export interface CartLine {
	id: string;
	quantity: number;
	variantId: string;
	variantTitle: string;
	productHandle: string;
	productTitle: string;
	unitPrice: Money;
	totalPrice: Money;
	image: Image | null;
}

export interface Cart {
	id: string;
	/** Absolute, or root-relative to the store; pass it through `resolveUrl` before it leaves the site. */
	checkoutUrl: string;
	totalQuantity: number;
	subtotal: Money;
	lines: CartLine[];
}

/**
 * One cart line change. `addToCart` adds `quantity` to the line; `setCartQuantities` makes it the line's total,
 * where `0` removes the line.
 */
export interface CartLineQuantity {
	variantId: string;
	quantity: number;
}

export interface StoreInfo {
	name: string;
	description: string;
}

/**
 * The title Shopify gives the only variant of a product without options; the storefront hides it.
 */
export const DEFAULT_VARIANT_TITLE = 'Default Title';

/**
 * The most units of one variant a cart line holds, enforced by the cart forms, the MCP tools and the demo cart.
 */
export const MAX_LINE_QUANTITY = 99;

export interface ListOptions {
	limit?: number;
}

/**
 * The one boundary between the storefront and a commerce backend.
 *
 * @remarks
 * A lookup that finds nothing resolves to `null`; a backend failure rejects. Cart ids are opaque strings owned by
 * the provider: callers keep the id a mutation returns, since a provider may issue a new one.
 */
export interface CommerceProvider {
	readonly kind: 'shopify' | 'demo';
	getStore(): Promise<StoreInfo>;
	listProducts(options?: ListOptions): Promise<ProductSummary[]>;
	searchProducts(query: string, options?: ListOptions): Promise<ProductSummary[]>;
	getProduct(handle: string): Promise<Product | null>;
	listCollections(options?: ListOptions): Promise<Collection[]>;
	getCollection(handle: string, options?: ListOptions): Promise<CollectionWithProducts | null>;
	getCart(cartId: string): Promise<Cart | null>;
	/**
	 * Adds quantities to the lines of a cart, creating the cart when `cartId` is missing or unknown.
	 */
	addToCart(cartId: string | undefined, lines: CartLineQuantity[]): Promise<Cart>;
	/**
	 * Sets each line's quantity, creating the cart when `cartId` is missing or unknown.
	 */
	setCartQuantities(cartId: string | undefined, lines: CartLineQuantity[]): Promise<Cart>;
}
