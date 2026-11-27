/**
 * The page cache tags of one product's page.
 *
 * @remarks
 * `product:<handle>` drops that page alone; `products` and `catalog` drop every product page, as after a catalog
 * import. The product page calls this from its `cache` function with its Params.
 */
export function productCacheTags(handle: string): string[] {
	return ['catalog', 'products', `product:${handle}`];
}
