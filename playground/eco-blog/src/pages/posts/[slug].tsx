import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { Markdown } from '@/components/markdown';
import { SiteLayout } from '@/layouts/site-layout/site-layout';
import { formatDate } from '@/lib/format';
import { postsService, type PublishedPost } from '@/lib/posts.server';
import './post.css';

export default eco.page<{ post: PublishedPost }, JsxRenderable>({
	layout: SiteLayout,
	cache: 'dynamic',
	staticProps: async ({ pathname }) => {
		const post = await postsService.findPublishedBySlug(String(pathname.params.slug));
		if (!post) throw HttpError.NotFound('Post not found');
		return { props: { post } };
	},
	metadata: ({ props }) => ({
		title: `${props.post.title} | EcoBlog`,
		description: props.post.excerpt ?? props.post.title,
	}),
	render: ({ post }) => (
		<article class="post">
			<a class="post__back" href="/">
				All posts
			</a>
			<header class="post__header">
				<time datetime={post.published_at.toISOString()}>{formatDate(post.published_at)}</time>
				<h1>{post.title}</h1>
				{post.excerpt ? <p class="post__lede">{post.excerpt}</p> : null}
			</header>
			<div class="post__body prose">
				<Markdown source={post.content} />
			</div>
		</article>
	),
});
