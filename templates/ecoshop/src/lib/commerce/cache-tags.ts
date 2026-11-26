/**
 * Page cache tags for catalog data. Catalog Pages list the tags of the data they render in
 * `cache: { revalidate, tags }`, and the revalidation webhook invalidates them.
 *
 * @remarks
 * A Cache Strategy's tags are the same for every Params of a Page, so a tag names a kind of data, not one product:
 * a product change re-renders every page tagged `products` on its next request. Shopify's delete webhooks carry
 * only an id, so a per-handle tag could not cover them anyway.
 */
export const CACHE_TAGS = {
	products: 'products',
	collections: 'collections',
	policies: 'policies',
} as const;

/**
 * How long a catalog page is served before it is regenerated in the background, in seconds. The webhook makes
 * changes show sooner; this bounds staleness when no webhook is configured.
 */
export const CATALOG_REVALIDATE_SECONDS = 300;
