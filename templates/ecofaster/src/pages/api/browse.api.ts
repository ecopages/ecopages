import { defineGet } from '@ecopages/core';
import { browseCatalogAction } from '@/lib/catalog/catalog-api.server';
import { firstQueryValue } from '@/lib/catalog/search-suggestions';
import { getCatalogDb } from '@/lib/db/catalog-database.server';

export const GET = defineGet({
	handler: async ({ query }) =>
		browseCatalogAction(await getCatalogDb(), {
			collection: firstQueryValue(query.collection) || undefined,
			category: firstQueryValue(query.category) || undefined,
		}),
});
