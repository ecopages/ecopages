import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CACHE_TAGS, productIdTag, productTag } from '@/lib/commerce/cache-tags';
import { handleShopifyWebhook, tagsForTopic } from './shopify-webhook.server';

const SECRET = 'whsec-test';

function webhook(topic: string, payload: unknown, secret = SECRET): Request {
	const body = JSON.stringify(payload);
	return new Request('https://shop.test/api/revalidate', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Shopify-Topic': topic,
			'X-Shopify-Hmac-Sha256': createHmac('sha256', secret).update(body, 'utf8').digest('base64'),
		},
		body,
	});
}

function cacheSpy() {
	return { invalidateByTags: vi.fn(async (tags: string[]) => tags.length) };
}

describe('Shopify revalidation webhook', () => {
	it('invalidates only the updated product and the product lists for a verified product update', async () => {
		const cache = cacheSpy();
		const tags = [productIdTag(1), productTag('field-shirt'), CACHE_TAGS.productListings];

		const response = await handleShopifyWebhook(webhook('products/update', { id: 1, handle: 'field-shirt' }), {
			secret: SECRET,
			cache,
		});

		expect(response.status).toBe(200);
		expect(cache.invalidateByTags).toHaveBeenCalledWith(tags);
		expect(await response.json()).toEqual({ revalidated: true, tags });
	});

	it('invalidates a deleted product by its id, the only thing the payload carries', async () => {
		const cache = cacheSpy();

		await handleShopifyWebhook(webhook('products/delete', { id: 1 }), { secret: SECRET, cache });

		expect(cache.invalidateByTags).toHaveBeenCalledWith([productIdTag(1), CACHE_TAGS.productListings]);
	});

	it('invalidates every product page when a product change names no product', async () => {
		const cache = cacheSpy();

		await handleShopifyWebhook(webhook('products/update', {}), { secret: SECRET, cache });

		expect(cache.invalidateByTags).toHaveBeenCalledWith([CACHE_TAGS.products]);
	});

	it('invalidates every product page when the body is not JSON', async () => {
		const cache = cacheSpy();
		const body = 'not json';
		const request = new Request('https://shop.test/api/revalidate', {
			method: 'POST',
			headers: {
				'X-Shopify-Topic': 'products/update',
				'X-Shopify-Hmac-Sha256': createHmac('sha256', SECRET).update(body, 'utf8').digest('base64'),
			},
			body,
		});

		await handleShopifyWebhook(request, { secret: SECRET, cache });

		expect(cache.invalidateByTags).toHaveBeenCalledWith([CACHE_TAGS.products]);
	});

	it('invalidates the collection tag for a collection change', async () => {
		const cache = cacheSpy();

		await handleShopifyWebhook(webhook('collections/delete', { id: 7 }), { secret: SECRET, cache });

		expect(cache.invalidateByTags).toHaveBeenCalledWith([CACHE_TAGS.collections]);
	});

	it('answers 401 to a webhook signed with another secret', async () => {
		const cache = cacheSpy();

		const response = await handleShopifyWebhook(
			webhook('products/update', { id: 1, handle: 'field-shirt' }, 'wrong-secret'),
			{ secret: SECRET, cache },
		);

		expect(response.status).toBe(401);
		expect(cache.invalidateByTags).not.toHaveBeenCalled();
	});

	it.each([
		['a missing signature', null],
		['a signature of the wrong length', 'c2hvcnQ='],
		['a signature that is not base64', '%%%'],
	])('answers 401 to %s', async (_label, signature) => {
		const request = webhook('products/update', { id: 1 });
		if (signature === null) request.headers.delete('x-shopify-hmac-sha256');
		else request.headers.set('x-shopify-hmac-sha256', signature);

		const response = await handleShopifyWebhook(request, { secret: SECRET, cache: cacheSpy() });

		expect(response.status).toBe(401);
	});

	it('answers 413 to a body over 1 MiB without checking it', async () => {
		const request = webhook('products/update', {});
		const oversized = new Request(request.url, {
			method: 'POST',
			headers: request.headers,
			body: 'x'.repeat(1024 * 1024 + 1),
		});
		const cache = cacheSpy();

		const response = await handleShopifyWebhook(oversized, { secret: SECRET, cache });

		expect(response.status).toBe(413);
		expect(cache.invalidateByTags).not.toHaveBeenCalled();
	});

	it('answers 401 when no secret is configured', async () => {
		const response = await handleShopifyWebhook(webhook('products/update', {}), { secret: undefined, cache: null });

		expect(response.status).toBe(401);
	});

	it('acknowledges a verified topic it does not cache', async () => {
		const cache = cacheSpy();

		const response = await handleShopifyWebhook(webhook('orders/create', { id: 3 }), { secret: SECRET, cache });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ revalidated: false, tags: [] });
		expect(cache.invalidateByTags).not.toHaveBeenCalled();
	});

	it('reports when the page cache is off', async () => {
		const response = await handleShopifyWebhook(webhook('products/delete', { id: 1 }), {
			secret: SECRET,
			cache: null,
		});

		expect(await response.json()).toEqual({
			revalidated: false,
			tags: [productIdTag(1), CACHE_TAGS.productListings],
		});
	});
});

describe('tagsForTopic', () => {
	it.each([
		['products/create', [CACHE_TAGS.products]],
		['products/update', [CACHE_TAGS.products]],
		['products/delete', [CACHE_TAGS.products]],
		['product_listings/update', [CACHE_TAGS.products]],
		['collections/update', [CACHE_TAGS.collections]],
		['collection_listings/remove', [CACHE_TAGS.collections]],
		['inventory_levels/update', [CACHE_TAGS.products]],
		['inventory_items/update', [CACHE_TAGS.products]],
		['shop/update', [CACHE_TAGS.collections, CACHE_TAGS.policies]],
		['orders/create', []],
		['', []],
	])('maps %s', (topic, tags) => {
		expect(tagsForTopic(topic)).toEqual(tags);
	});

	it.each(['products/create', 'products/update'])(
		'maps %s to that product by id and handle, and the lists',
		(topic) => {
			expect(tagsForTopic(topic, { id: 8790000000001, handle: 'field-shirt' })).toEqual([
				productIdTag(8790000000001),
				productTag('field-shirt'),
				CACHE_TAGS.productListings,
			]);
		},
	);

	it('maps a delete to the product by its id alone', () => {
		expect(tagsForTopic('products/delete', { id: '7' })).toEqual([productIdTag('7'), CACHE_TAGS.productListings]);
	});

	it('leaves a topic outside the product change topics as its resource maps it', () => {
		expect(tagsForTopic('inventory_levels/update', { id: 1, handle: 'field-shirt' })).toEqual([
			CACHE_TAGS.products,
		]);
	});

	it('finds a page cached under the product global id by the number a webhook sends', () => {
		expect(productIdTag('gid://shopify/Product/8790000000001')).toBe(productIdTag(8790000000001));
	});
});
