import { definePost } from '@ecopages/core';
import {
	refuseInvalidChange,
	sameOriginOnly,
	updateCartAction,
	updateCartSchema,
} from '@/lib/storefront/cart-http.server';
import { cartHttpDeps } from '@/lib/storefront/deps.server';

export const POST = definePost({
	middleware: [sameOriginOnly],
	schema: { body: updateCartSchema },
	onInvalid: (_issues, { request }) => refuseInvalidChange(request),
	handler: async ({ request, body }) => updateCartAction(request, body, cartHttpDeps()),
});
