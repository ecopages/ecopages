import { definePost } from '@ecopages/core';
import { readPostForm } from '@/lib/post-form.server';
import { postsService } from '@/lib/posts.server';
import { requireSession } from '@/lib/require-session.server';

export const POST = definePost({
	middleware: [requireSession],
	handler: async ({ request, locals, services }) => {
		const form = await readPostForm(request);
		await postsService.create({ ...form, authorId: locals.session!.user.id });
		await services.cache?.invalidateByTags(['posts']);
		return Response.redirect(new URL('/admin', request.url), 303);
	},
});
