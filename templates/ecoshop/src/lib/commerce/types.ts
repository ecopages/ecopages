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
	productType: string;
	options: ProductOption[];
	/** The variant to buy when the shopper names no option: the first available one, or `null` when none is. */
	defaultVariantId: string | null;
	variantCount: number;
}

export interface Product extends ProductSummary {
	description: string;
	tags: string[];
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

/**
 * Something the shopper and an agent should know about a cart change that went through: a quantity the store capped,
 * or a change it only partly made.
 */
export interface CartMessage {
	type: 'error' | 'warning' | 'info';
	code: string;
	content: string;
	/** For `quantity_reduced`: the variant whose line holds less than asked, and how many the change asked it to hold. */
	variantId?: string;
	wanted?: number;
}

export interface Cart {
	id: string;
	/**
	 * What the provider has to say about the change that returned this cart. Only the result of a change carries any: a
	 * cart that is read has none.
	 */
	messages?: CartMessage[];
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
 * The kinds of store information an agent can ask about, named as Shopify's `ask_business` tool links them.
 */
export type StorePolicyType = 'refund_policy' | 'shipping_policy' | 'privacy_policy' | 'terms_of_service' | 'faq';

/**
 * A published policy or FAQ page, as plain text.
 */
export interface StorePolicy {
	handle: string;
	type: StorePolicyType;
	title: string;
	/** Plain text; paragraphs are separated by a blank line. */
	body: string;
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
 * How a product list is ordered. `best-selling` is the provider's own order, the one a shopper sees first.
 */
export const PRODUCT_SORTS = [
	'best-selling',
	'price-ascending',
	'price-descending',
	'title-ascending',
	'title-descending',
] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

/**
 * A product list read from the provider already ordered and cut: `sort` orders the whole catalog or collection,
 * and the result starts at `offset` and holds at most `limit` products.
 */
export interface ProductListOptions extends ListOptions {
	sort?: ProductSort;
	offset?: number;
}

/**
 * The one boundary between the storefront and a commerce backend.
 *
 * @remarks
 * A lookup that finds nothing resolves to `null`; a backend failure rejects. Cart ids are opaque strings owned by
 * the provider: callers keep the id a mutation returns, since a provider may issue a new one.
 */
export interface CommerceProvider {
	getStore(): Promise<StoreInfo>;
	/**
	 * The origin of the connected store, such as `https://my-store.myshopify.com`, where its UCP profile and endpoint
	 * live, or `null` for a provider with no store behind it.
	 */
	ucpOrigin(): string | null;
	listProducts(options?: ProductListOptions): Promise<ProductSummary[]>;
	searchProducts(query: string, options?: ListOptions): Promise<ProductSummary[]>;
	/**
	 * Reads a product by handle or by the provider's product GID.
	 */
	getProduct(handleOrId: string): Promise<Product | null>;
	listPolicies(): Promise<StorePolicy[]>;
	listCollections(options?: ListOptions): Promise<Collection[]>;
	getCollection(handle: string, options?: ProductListOptions): Promise<CollectionWithProducts | null>;
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
