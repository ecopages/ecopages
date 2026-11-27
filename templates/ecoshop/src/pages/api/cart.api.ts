import { defineGet, definePost } from '@ecopages/core';
import {
	cartActionSchema,
	handleCartGet,
	handleCartPost,
	redirectInvalidPost,
	sameOriginOnly,
} from '@/lib/cart/cart-endpoint.server';
import { getCommerce } from '@/lib/commerce/provider.server';

export const GET = defineGet({
	handler: async ({ request }) => handleCartGet(request, getCommerce()),
});

export const POST = definePost({
	middleware: [sameOriginOnly],
	schema: { body: cartActionSchema },
	onInvalid: redirectInvalidPost,
	handler: async ({ request, body }) => handleCartPost(request, getCommerce(), body),
});
