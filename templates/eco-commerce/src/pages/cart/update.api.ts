import { definePost } from '@ecopages/core';
import { updateCartAction } from '@/lib/storefront/cart-http.server';
import { cartHttpDeps } from '@/lib/storefront/deps.server';

export const POST = definePost({
	handler: async ({ request }) => updateCartAction(request, cartHttpDeps()),
});
