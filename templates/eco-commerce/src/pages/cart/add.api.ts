import { definePost } from '@ecopages/core';
import { addToCartAction } from '@/lib/storefront/cart-http.server';
import { cartHttpDeps } from '@/lib/storefront/deps.server';

export const POST = definePost({
	handler: async ({ request }) => addToCartAction(request, cartHttpDeps()),
});
