import { definePost } from '@ecopages/core';
import {
	refuseInvalidChange,
	sameSiteOnly,
	updateCartAction,
	updateCartSchema,
} from '@/lib/storefront/cart-http.server';
import { cartHttpDeps } from '@/lib/storefront/deps.server';

export const POST = definePost({
	middleware: [sameSiteOnly],
	schema: { body: updateCartSchema },
	onInvalid: (_issues, { request }) => refuseInvalidChange(request),
	handler: async ({ request, body }) => updateCartAction(request, body, cartHttpDeps()),
});
