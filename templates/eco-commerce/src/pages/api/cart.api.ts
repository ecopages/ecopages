import { defineGet } from '@ecopages/core';
import { cartSummaryAction } from '@/lib/storefront/cart-http.server';
import { cartHttpDeps } from '@/lib/storefront/deps.server';

export const GET = defineGet({
	handler: async ({ request }) => cartSummaryAction(request, cartHttpDeps()),
});
