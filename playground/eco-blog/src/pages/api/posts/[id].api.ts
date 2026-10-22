import { definePost } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import { postIdParams, publishDateFor, readPostForm } from '@/lib/post-form.server';
import { postsService } from '@/lib/posts.server';
import { requireSession } from '@/lib/require-session.server';

export const POST = definePost({
	middleware: [requireSession],
	schema: { params: postIdParams },
	handler: async ({ request, params, services }) => {
		const existing = await postsService.findById(params.id);
		if (!existing) throw HttpError.NotFound('Post not found');

		const { intent, ...fields } = await readPostForm(request);
		await postsService.update(params.id, {
			...fields,
			published_at: publishDateFor(intent, existing.published_at),
		});
		await services.cache?.invalidateByTags(['posts']);
		return Response.redirect(new URL('/admin', request.url), 303);
	},
});
