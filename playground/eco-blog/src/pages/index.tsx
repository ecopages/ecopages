import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { PostCard } from '@/components/post-card/post-card';
import { SiteLayout } from '@/layouts/site-layout/site-layout';
import { postsService, type Post } from '@/lib/posts.server';
import './index.css';

export default eco.page<{ posts: Post[] }, JsxRenderable>({
	layout: SiteLayout,
	cache: { revalidate: 60, tags: ['posts'] },
	staticProps: async () => ({ props: { posts: await postsService.list() } }),
	metadata: () => ({
		title: 'EcoBlog',
		description: 'Notes on building for the web with less JavaScript.',
	}),
	render: ({ posts }) => (
		<>
			<header class="home-intro breakout">
				<h1>Notes on building for the web</h1>
				<p>Short essays on HTML-first sites, CSS that adapts on its own, and shipping less JavaScript.</p>
			</header>
			{posts.length === 0 ? (
				<p class="home-empty">No posts yet.</p>
			) : (
				<ul class="post-grid breakout" role="list">
					{posts.map((post) => (
						<PostCard post={post} />
					))}
				</ul>
			)}
		</>
	),
});
