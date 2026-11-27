import { definePost } from '@ecopages/core';
import { addToCartAction, addToCartSchema, refuseInvalidChange, sameSiteOnly } from '@/lib/storefront/cart-http.server';
import { cartHttpDeps } from '@/lib/storefront/deps.server';

export const POST = definePost({
	middleware: [sameSiteOnly],
	schema: { body: addToCartSchema },
	onInvalid: (_issues, { request }) => refuseInvalidChange(request),
	handler: async ({ request, body }) => addToCartAction(request, body, cartHttpDeps()),
});
