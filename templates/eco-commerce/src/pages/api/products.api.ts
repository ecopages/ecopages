import { defineGet } from '@ecopages/core';
import { getCommerceBackend } from '@/lib/commerce/index.server';
import { productListAction } from '@/lib/storefront/product-list.server';

export const GET = defineGet({
	handler: async ({ query }) => productListAction(getCommerceBackend().catalog, query),
});
