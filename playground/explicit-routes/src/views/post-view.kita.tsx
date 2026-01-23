import { eco } from '@ecopages/core';
import { MainLayout } from '@/layouts/main-layout.kita';
import { type Post, posts } from '@/data';

export type PostViewProps = Post;

export const PostView = eco.page<PostViewProps>({
	__eco: {
		integration: 'kitajs',
		dir: import.meta.dir,
	},
	layout: MainLayout,
	metadata: ({ props }) => ({
		title: `${props.title} | Explicit Routes`,
		description: 'A dedicated post page',
	}),
	staticPaths: async () => {
		return {
			paths: posts.map((post) => ({ params: { slug: post.slug } })),
		};
	},
	staticProps: async ({ pathname }) => {
		const post = posts.find((p) => p.slug === (pathname.params.slug as string));
		if (!post) throw new Error('Post not found');
		return { props: post };
	},
	render: ({ title, content }) => (
		<article class="prose lg:prose-xl">
			<h1>{title}</h1>
			<div class="whitespace-pre-wrap">{content}</div>
			<div class="mt-8">
				<a href="/posts" class="text-link hover:text-link-hover font-medium">
					&larr; Back to posts
				</a>
			</div>
		</article>
	),
});
