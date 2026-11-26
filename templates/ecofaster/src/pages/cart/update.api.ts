import { definePost } from '@ecopages/core';
import { updateCartAction } from '@/lib/cart/cart-actions.server';
import { getCartDeps } from '@/lib/cart/cart-deps.server';

export const POST = definePost({
	handler: async ({ request }) => updateCartAction(request, await getCartDeps()),
});
