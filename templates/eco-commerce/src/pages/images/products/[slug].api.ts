import { defineGet } from '@ecopages/core';
import { renderPlaceholderSvg } from '@/lib/images/placeholder';

/**
 * `GET /images/products/<slug>`: the generated placeholder image of a product.
 *
 * @remarks
 * The image depends on the slug alone, so browsers keep it for a day and revalidate it in the background for a
 * week. Replace this Endpoint with your image storage when the catalog has real photos.
 */
export const GET = defineGet({
	handler: async ({ params }) =>
		new Response(renderPlaceholderSvg(String(params.slug)), {
			headers: {
				'content-type': 'image/svg+xml; charset=utf-8',
				'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
			},
		}),
});
