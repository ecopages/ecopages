import { defineGet } from '@ecopages/core';
import { cartSummaryAction } from '@/lib/cart/cart-actions.server';
import { getCartDeps } from '@/lib/cart/cart-deps.server';

export const GET = defineGet({
	handler: async ({ request }) => cartSummaryAction(request, await getCartDeps()),
});
