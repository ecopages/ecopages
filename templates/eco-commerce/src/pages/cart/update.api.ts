import { definePost } from '@ecopages/core';
import { sameSiteOnly, updateCartAction, updateCartSchema } from '@/lib/storefront/cart-http.server';
import { cartHttpDeps } from '@/lib/storefront/deps.server';

export const POST = definePost({
	middleware: [sameSiteOnly],
	schema: { body: updateCartSchema },
	handler: async ({ request, body }) => updateCartAction(request, body, cartHttpDeps()),
});
