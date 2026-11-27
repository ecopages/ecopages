import { definePost } from '@ecopages/core';
import { addToCartAction, addToCartSchema, sameSiteOnly } from '@/lib/storefront/cart-http.server';
import { cartHttpDeps } from '@/lib/storefront/deps.server';

export const POST = definePost({
	middleware: [sameSiteOnly],
	schema: { body: addToCartSchema },
	handler: async ({ request, body }) => addToCartAction(request, body, cartHttpDeps()),
});
