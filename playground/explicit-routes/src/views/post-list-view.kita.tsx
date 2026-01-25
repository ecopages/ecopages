import { eco } from '@ecopages/core';
import { MainLayout } from '@/layouts/main-layout.kita';
import { type Post, posts } from '@/data';

export type PostListViewProps = {
	posts: Post[];
};

export const PostListView = eco.page<PostListViewProps>({
	layout: MainLayout,
	metadata: () => ({
		title: 'Posts | Explicit Routes',
		description: 'List of all posts',
	}),
	staticProps: async () => {
		return { props: { posts } };
	},
	render: ({ posts }) => {
		return (
			<div>
				<h1 class="text-3xl font-serif font-bold mb-8">Latest Posts</h1>
				<div class="grid gap-6">
					{posts.map((post) => (
						<div class="p-6 border border-border rounded-lg hover:shadow-md transition-shadow bg-surface-elevated">
							<h2 class="text-2xl font-bold mb-2">
								<a href={`/posts/${post.slug}`} class="hover:text-accent transition-colors">
									{post.title}
								</a>
							</h2>
							<p class="text-text-muted mb-4 line-clamp-2">{post.content}</p>
							<a href={`/posts/${post.slug}`} class="text-link hover:text-link-hover font-medium">
								Read more &rarr;
							</a>
						</div>
					))}
				</div>
			</div>
		);
	},
});
