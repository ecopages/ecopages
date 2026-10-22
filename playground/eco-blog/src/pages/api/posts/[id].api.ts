import { definePost } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import { postIdParams, readPostForm } from '@/lib/post-form.server';
import { postsService } from '@/lib/posts.server';
import { requireSession } from '@/lib/require-session.server';

export const POST = definePost({
	middleware: [requireSession],
	schema: { params: postIdParams },
	handler: async ({ request, params, services }) => {
		const post = await postsService.update(params.id, await readPostForm(request));
		if (!post) throw HttpError.NotFound('Post not found');
		await services.cache?.invalidateByTags(['posts']);
		return Response.redirect(new URL('/admin', request.url), 303);
	},
});
