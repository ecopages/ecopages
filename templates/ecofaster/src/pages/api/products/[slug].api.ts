import { defineGet } from '@ecopages/core';
import { productDetailsAction } from '@/lib/catalog/catalog-api.server';
import { getCatalogDb } from '@/lib/db/catalog-database.server';

export const GET = defineGet({
	handler: async ({ params }) => productDetailsAction(await getCatalogDb(), String(params.slug)),
});
