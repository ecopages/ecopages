import { defineGet } from '@ecopages/core';
import { searchSuggestionsAction } from '@/lib/catalog/search.server';
import { getCatalogDb } from '@/lib/db/catalog-database.server';

export const GET = defineGet({
	handler: async ({ query }) => searchSuggestionsAction(await getCatalogDb(), query.q, query.limit),
});
