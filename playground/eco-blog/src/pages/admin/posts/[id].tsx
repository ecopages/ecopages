import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import { PostEditor } from '@/components/post-editor/post-editor';
import { AdminShell } from '@/layouts/admin-shell/admin-shell';
import { postIdParams } from '@/lib/post-form.server';
import { postsService } from '@/lib/posts.server';
import { requireSession } from '@/lib/require-session.server';

export default eco.page({
	cache: 'dynamic',
	middleware: [requireSession],
	props: async ({ params }) => {
		const { id } = postIdParams.parse(params);
		const post = await postsService.findById(id);
		if (!post) throw HttpError.NotFound('Post not found');
		return { post };
	},
	metadata: ({ props }) => ({
		title: `Edit: ${props.post.title} | EcoBlog author`,
		description: 'Edit a blog post.',
	}),
	render: ({ post, locals }) => (
		<AdminShell current="posts" userName={locals.session.user.name}>
			<PostEditor post={post} />
		</AdminShell>
	),
});
