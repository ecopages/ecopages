import { createHmac, timingSafeEqual } from 'node:crypto';
import { CACHE_TAGS } from '@/lib/commerce/cache-tags';

/**
 * The part of the page cache the webhook needs: Ecopages' `services.cache`.
 */
export interface TagInvalidator {
	invalidateByTags(tags: string[]): Promise<unknown>;
}

export interface ShopifyWebhookOptions {
	/** The secret Shopify signs webhooks with: the app's client secret, or the store's webhook signing key. */
	secret: string | undefined;
	/** `null` when the page cache is off, as in `ecopages dev`. */
	cache: TagInvalidator | null;
}

/**
 * The webhook signing secret, from `SHOPIFY_WEBHOOK_SECRET`.
 */
export function shopifyWebhookSecret(): string | undefined {
	return process.env.SHOPIFY_WEBHOOK_SECRET?.trim() || undefined;
}

/**
 * Checks `X-Shopify-Hmac-Sha256`: the base64 HMAC-SHA256 of the raw body under the shared secret.
 */
export function verifyShopifyHmac(rawBody: Uint8Array, signature: string | null, secret: string): boolean {
	if (!signature) return false;
	const expected = createHmac('sha256', secret).update(rawBody).digest();
	const received = Buffer.from(signature, 'base64');
	return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * The cache tags each resource's topics affect. Stock changes come as `inventory_levels/*` and `inventory_items/*`,
 * which name an inventory item, not a product, so they invalidate every page tagged `products`.
 */
const TAGS_BY_RESOURCE = new Map<string, string[]>([
	['products', [CACHE_TAGS.products]],
	['product_listings', [CACHE_TAGS.products]],
	['inventory_levels', [CACHE_TAGS.products]],
	['inventory_items', [CACHE_TAGS.products]],
	['collections', [CACHE_TAGS.collections]],
	['collection_listings', [CACHE_TAGS.collections]],
]);

/**
 * Topics whose tags differ from their resource's.
 *
 * @remarks
 * Shopify has no webhook topic for a policy edit. `shop/update` ("occurs whenever a shop is updated") is the
 * closest: it re-renders the policy pages, and the home page through `collections`, which shows the shop's name and
 * description.
 */
const TAGS_BY_TOPIC = new Map<string, string[]>([['shop/update', [CACHE_TAGS.collections, CACHE_TAGS.policies]]]);

/**
 * The cache tags a webhook topic affects. Topics outside the catalog affect none.
 */
export function tagsForTopic(topic: string): string[] {
	return TAGS_BY_TOPIC.get(topic) ?? TAGS_BY_RESOURCE.get(topic.split('/')[0] ?? '') ?? [];
}

/**
 * Verifies a Shopify webhook and invalidates the cache tags of the catalog data it reports changed.
 *
 * @remarks
 * The signature covers the exact bytes Shopify sent, so it is checked over the raw body, before any decoding. A
 * missing secret fails closed with 401, like a bad signature, so an unconfigured store cannot be flooded with
 * cache purges.
 */
export async function handleShopifyWebhook(request: Request, options: ShopifyWebhookOptions): Promise<Response> {
	const rawBody = new Uint8Array(await request.arrayBuffer());
	if (!options.secret || !verifyShopifyHmac(rawBody, request.headers.get('x-shopify-hmac-sha256'), options.secret)) {
		return Response.json({ error: 'Invalid webhook signature' }, { status: 401 });
	}

	const tags = tagsForTopic(request.headers.get('x-shopify-topic') ?? '');
	if (tags.length && options.cache) {
		await options.cache.invalidateByTags(tags);
		return Response.json({ revalidated: true, tags });
	}
	return Response.json({ revalidated: false, tags });
}
