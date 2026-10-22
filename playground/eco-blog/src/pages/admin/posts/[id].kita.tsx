import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import { PostEditor } from '@/components/post-editor/post-editor.kita';
import { AdminLayout } from '@/layouts/admin-layout.kita';
import { postIdParams } from '@/lib/post-form.server';
import { postsService, type Post } from '@/lib/posts.server';
import { requireSession } from '@/lib/require-session.server';

export default eco.page<{ post: Post }>({
	layout: AdminLayout,
	cache: 'dynamic',
	middleware: [requireSession],
	requires: ['session'] as const,
	staticProps: async ({ pathname }) => {
		const { id } = postIdParams.parse(pathname.params);
		const post = await postsService.findById(id);
		if (!post) throw HttpError.NotFound('Post not found');
		return { props: { post } };
	},
	metadata: ({ props }) => ({ title: `Edit: ${props.post.title} | Admin`, description: 'Edit a blog post' }),
	render: ({ post }) => <PostEditor post={post} />,
});
