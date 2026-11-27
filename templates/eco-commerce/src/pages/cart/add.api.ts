import { definePost } from '@ecopages/core';
import { addToCartAction, addToCartSchema } from '@/lib/storefront/cart-http.server';
import { cartHttpDeps } from '@/lib/storefront/deps.server';

export const POST = definePost({
	schema: { body: addToCartSchema },
	handler: async ({ request, body }) => addToCartAction(request, body, cartHttpDeps()),
});
