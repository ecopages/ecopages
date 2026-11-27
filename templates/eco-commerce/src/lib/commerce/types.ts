/**
 * Plain domain types every commerce backend returns.
 *
 * @remarks
 * Ids are opaque strings and handles are URL-safe slugs, as in Medusa's Store API, so a remote backend can
 * return its own ids without the storefront noticing. Collections, categories and subcategories map to a
 * collection and a two-level category tree there; a product's finishes map to its variants.
 */

/** An amount in minor units (cents) and its ISO 4217 currency code, lowercase. */
export type Money = {
	amount: number;
	currencyCode: string;
};

export type Badge = 'new' | 'sale';

/** A node of the catalog tree: a collection, a category or a subcategory. */
export type Place = {
	id: string;
	handle: string;
	name: string;
};

/** What a product card shows. */
export type ProductCard = {
	id: string;
	handle: string;
	title: string;
	price: Money;
	/** The price before a sale, when the product is on sale. */
	compareAtPrice: Money | null;
	badge: Badge | null;
	material: string;
	thumbnail: string;
};

/** One purchasable option of a product, here a finish. */
export type ProductVariant = {
	id: string;
	title: string;
};

export type Product = ProductCard & {
	description: string;
	variants: ProductVariant[];
	collection: Place;
	category: Place;
	subcategory: Place;
};

export type SubcategorySummary = Place & { productCount: number; thumbnail: string };

export type StoreTree = Array<
	Place & { tagline: string; categories: Array<Place & { subcategories: SubcategorySummary[] }> }
>;

export type CollectionDetail = StoreTree[number];

export type CategoryDetail = {
	collection: Place;
	category: Place;
	subcategories: Array<SubcategorySummary & { products: ProductCard[] }>;
};

export type SubcategoryDetail = {
	collection: Place;
	category: Place;
	subcategory: SubcategorySummary;
};

export type ProductSort = 'featured' | 'price-asc' | 'price-desc' | 'name';

/** A product listing request: a scope (search term or subcategory), filters, a sort and a page. */
export type ProductQuery = {
	search?: string;
	/** A subcategory handle. */
	subcategory?: string;
	materials?: string[];
	finishes?: string[];
	/** Lowest price, in minor units. */
	minPrice?: number;
	/** Highest price, in minor units. */
	maxPrice?: number;
	badge?: Badge;
	sort?: ProductSort;
	/** One-based. */
	page?: number;
	pageSize?: number;
};

export type ProductPage = {
	items: ProductCard[];
	total: number;
	page: number;
	pageCount: number;
	/** The filter values available in the listing's scope, before its filters apply. */
	facets: { materials: string[]; finishes: string[] };
};

/** Static paths of the catalog pages, for `paths` hooks. */
export type CatalogPaths = {
	collections: Array<{ collection: string }>;
	categories: Array<{ collection: string; category: string }>;
	subcategories: Array<{ collection: string; category: string; subcategory: string; productCount: number }>;
};

export type CartLine = {
	variantId: string;
	productId: string;
	handle: string;
	title: string;
	variantTitle: string;
	thumbnail: string;
	quantity: number;
	unitPrice: Money;
	subtotal: Money;
};

export type Cart = {
	lines: CartLine[];
	itemCount: number;
	subtotal: Money;
};

/**
 * Whatever identifies the visitor's cart between requests, as the cart cookie carries it.
 *
 * @remarks
 * The default backend stores carts in its database and puts the signed cart id here; an external backend would
 * put its own cart id.
 */
export type CartToken = string | null;

/**
 * The result of a cart change.
 *
 * @remarks
 * `token` is what the cart cookie should hold from now on; `null` when no cart exists, such as after removing a
 * line from a cart the visitor never had, so the caller leaves the cookie as it is.
 */
export type CartUpdate =
	| { ok: true; cart: Cart; token: CartToken }
	| { ok: false; reason: 'unknown-variant' | 'cart-full' | 'invalid-quantity'; message: string };
