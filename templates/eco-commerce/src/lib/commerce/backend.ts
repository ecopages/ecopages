import type {
	CartToken,
	CartUpdate,
	Cart,
	CatalogPaths,
	CategoryDetail,
	CollectionDetail,
	Product,
	ProductCard,
	ProductPage,
	ProductQuery,
	StoreTree,
	SubcategoryDetail,
} from './types.ts';

/** Catalog reads. Every method resolves `null` for a handle the catalog does not have. */
export interface CatalogBackend {
	getStoreTree(): Promise<StoreTree>;
	getCollection(collection: string): Promise<CollectionDetail | null>;
	getCategory(collection: string, category: string): Promise<CategoryDetail | null>;
	getSubcategory(collection: string, category: string, subcategory: string): Promise<SubcategoryDetail | null>;
	/** Lists products in a scope with filters, a sort and a page; search terms match product titles. */
	listProducts(query: ProductQuery): Promise<ProductPage>;
	getProduct(handle: string): Promise<Product | null>;
	/** Products from the same subcategory, then the same category, excluding the product itself. */
	getRelatedProducts(handle: string, limit: number): Promise<ProductCard[]>;
	listCatalogPaths(): Promise<CatalogPaths>;
	/** Handles of the products worth rendering at build: the first `perSubcategory` of each subcategory. */
	listFeaturedProductHandles(perSubcategory: number): Promise<string[]>;
}

/**
 * Cart operations. A change returns the new token for the cookie, or why it was refused.
 *
 * @remarks
 * A quantity of 0 in `updateItem` removes the line.
 */
export interface CartBackend {
	getCart(token: CartToken): Promise<Cart>;
	addItem(token: CartToken, item: { variantId: string; quantity: number }): Promise<CartUpdate>;
	updateItem(token: CartToken, item: { variantId: string; quantity: number }): Promise<CartUpdate>;
}

/**
 * The boundary between the storefront and where the catalog and carts live.
 *
 * @remarks
 * Pages, Endpoints and agent tools reach data only through this interface, from `getCommerceBackend()`. The
 * default adapter, in `drizzle/`, reads SQLite (or another libSQL database); a remote adapter, such as one for
 * Medusa's Store API, implements the same methods. `src/lib/commerce/contract.ts` is the test suite an adapter
 * must pass.
 */
export interface CommerceBackend {
	catalog: CatalogBackend;
	cart: CartBackend;
}
