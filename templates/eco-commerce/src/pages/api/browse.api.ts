import { defineGet } from '@ecopages/core';
import { getCommerceBackend } from '@/lib/commerce/index.server';
import { browseCatalogAction } from '@/lib/storefront/catalog-api.server';
import { firstQueryValue } from '@/lib/storefront/listing-query';

export const GET = defineGet({
	handler: async ({ query }) =>
		browseCatalogAction(getCommerceBackend().catalog, {
			collection: firstQueryValue(query.collection) || undefined,
			category: firstQueryValue(query.category) || undefined,
		}),
});
