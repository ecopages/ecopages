/**
 * A Shopify store domain as the Storefront API and the store's own routes address it: `my-store.myshopify.com`, without
 * a protocol or a trailing slash, as it may be written in an environment variable.
 */
export function normalizeStoreDomain(value: string): string {
	return value
		.trim()
		.replace(/^https?:\/\//u, '')
		.replace(/\/+$/u, '');
}
