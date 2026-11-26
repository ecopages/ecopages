import { defineGet } from '@ecopages/core';
import { getCommerceBackend } from '@/lib/commerce/index.server';
import { productDetailsAction } from '@/lib/storefront/catalog-api.server';

export const GET = defineGet({
	handler: async ({ params }) => productDetailsAction(getCommerceBackend().catalog, String(params.slug)),
});
