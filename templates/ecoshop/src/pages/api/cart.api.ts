import { defineGet, definePost } from '@ecopages/core';
import { handleCartGet, handleCartPost } from '@/lib/cart/cart-endpoint.server';
import { getCommerce } from '@/lib/commerce/provider.server';

export const GET = defineGet({
	handler: async ({ request }) => handleCartGet(request, getCommerce()),
});

export const POST = definePost({
	handler: async ({ request }) => handleCartPost(request, getCommerce()),
});
