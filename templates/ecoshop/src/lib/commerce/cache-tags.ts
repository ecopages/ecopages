/**
 * Page cache tags for catalog data. Catalog Pages list the tags of the data they render in
 * `cache: { revalidate, tags }`, and the revalidation webhook invalidates them.
 *
 * @remarks
 * A product page tags itself with `productTag(handle)` from its Params and `productIdTag(id)` from its props, so a
 * change to one product re-renders that page and no other product page. `products` stays on every page that shows
 * product data, which is what a change that names no product invalidates: a stock change names an inventory item.
 * `product-listings` is on the pages that list products, the home and collection pages, so a product's change
 * reaches the lists that show its price and availability.
 */
export const CACHE_TAGS = {
	products: 'products',
	productListings: 'product-listings',
	collections: 'collections',
	policies: 'policies',
} as const;

/**
 * The tag of one product's page by its handle.
 */
export function productTag(handle: string): string {
	return `product:${handle}`;
}

/**
 * The tag of one product's page by its id, which a handle change leaves as it was.
 *
 * @remarks
 * A webhook names the product's new handle, so the page cached under the old one is found by id. Shopify's Storefront
 * API ids are global ids (`gid://shopify/Product/123`) and a webhook sends the number alone, so the tag keeps the last
 * segment.
 */
export function productIdTag(id: string | number): string {
	return `product-id:${String(id).split('/').pop()}`;
}

/**
 * How long a catalog page is served before it is regenerated in the background, in seconds. The webhook makes
 * changes show sooner; this bounds staleness when no webhook is configured.
 */
export const CATALOG_REVALIDATE_SECONDS = 300;
