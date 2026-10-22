import { definePost } from '@ecopages/core';
import { postIdParams } from '@/lib/post-form.server';
import { postsService } from '@/lib/posts.server';
import { requireSession } from '@/lib/require-session.server';

export const POST = definePost({
	middleware: [requireSession],
	schema: { params: postIdParams },
	handler: async ({ request, params, services }) => {
		await postsService.remove(params.id);
		await services.cache?.invalidateByTags(['posts']);
		return Response.redirect(new URL('/admin', request.url), 303);
	},
});
