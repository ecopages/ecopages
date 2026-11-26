import { definePost } from '@ecopages/core';
import { handleShopifyWebhook, shopifyWebhookSecret } from '@/lib/webhooks/shopify-webhook.server';

/**
 * Shopify webhook target: point the `products/*` and `collections/*` topics here.
 */
export const POST = definePost({
	handler: async ({ request, services }) =>
		handleShopifyWebhook(request, { secret: shopifyWebhookSecret(), cache: services.cache }),
});
