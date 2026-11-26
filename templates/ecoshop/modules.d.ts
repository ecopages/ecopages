import '@ecopages/core/declarations';
import '@ecopages/core/env';
import '@ecopages/jsx/jsx-runtime';

declare global {
	namespace NodeJS {
		interface ProcessEnv {
			/** The store's domain, such as `my-store.myshopify.com`. Unset with the token to use the demo catalog. */
			SHOPIFY_STORE_DOMAIN?: string;
			/** A public Storefront API access token. */
			SHOPIFY_STOREFRONT_ACCESS_TOKEN?: string;
			/** Storefront API version; defaults to the version pinned in `src/lib/commerce/provider.server.ts`. */
			SHOPIFY_API_VERSION?: string;
			/** The secret Shopify signs webhooks with, checked by `/api/revalidate`. */
			SHOPIFY_WEBHOOK_SECRET?: string;
		}
	}
}
