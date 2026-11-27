import { definePost } from '@ecopages/core';
import { revalidateAction } from '@/lib/storefront/revalidate.server';

export const POST = definePost({
	handler: async ({ request, services }) =>
		revalidateAction(request, { token: process.env.REVALIDATE_TOKEN, cache: services.cache }),
});
