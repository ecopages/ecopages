import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { PostEditor } from '@/components/post-editor/post-editor';
import { AdminShell } from '@/layouts/admin-shell/admin-shell';
import { postIdParams } from '@/lib/post-form.server';
import { postsService, type Post } from '@/lib/posts.server';
import { requireSession } from '@/lib/require-session.server';

export default eco.page<{ post: Post }, JsxRenderable>({
	cache: 'dynamic',
	middleware: [requireSession],
	requires: ['session'] as const,
	staticProps: async ({ pathname }) => {
		const { id } = postIdParams.parse(pathname.params);
		const post = await postsService.findById(id);
		if (!post) throw HttpError.NotFound('Post not found');
		return { props: { post } };
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
