import { definePost, sameOrigin } from '@ecopages/core';
import { handleShopifyWebhook, shopifyWebhookSecret } from '@/lib/webhooks/shopify-webhook.server';

/**
 * Shopify webhook target: point the `products/*` and `collections/*` topics here.
 *
 * @remarks
 * Shopify posts from its servers and sends no `Origin`, and the HMAC signature authenticates it, so `sameOrigin()`
 * lets a request with neither header through and refuses a browser request from another site.
 */
export const POST = definePost({
	middleware: [sameOrigin({ allowNonBrowser: true })],
	handler: async ({ request, services }) =>
		handleShopifyWebhook(request, { secret: shopifyWebhookSecret(), cache: services.cache }),
});
