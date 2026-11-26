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
 * The cache tags a webhook topic affects. Topics outside the catalog affect none.
 */
export function tagsForTopic(topic: string): string[] {
	const resource = topic.split('/')[0];
	if (resource === 'products' || resource === 'product_listings') return [CACHE_TAGS.products];
	if (resource === 'collections' || resource === 'collection_listings') return [CACHE_TAGS.collections];
	return [];
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
