import { definePost, sameOrigin } from '@ecopages/core';
import { requireRevalidateToken, revalidateAction, revalidateSchema } from '@/lib/storefront/revalidate.server';

/**
 * Callers are servers and scripts that send a bearer token, so a request with no `Origin` passes `sameOrigin()`;
 * a browser request from another site is still refused.
 */
export const POST = definePost({
	middleware: [sameOrigin({ allowNonBrowser: true }), requireRevalidateToken],
	schema: { body: revalidateSchema },
	handler: async ({ body, services }) => revalidateAction(body, { cache: services.cache }),
});
