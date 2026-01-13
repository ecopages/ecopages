import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout/base-layout.kita';
import { EcoImage } from '@ecopages/image-processor/component/html';
import {
	ezi76Gu53NklsuUnsplashJpg,
	theodorePoncetQzephogqd7WUnsplashJpg,
	urbanVintage78A265Wpio4UnsplashJpg,
} from 'ecopages:images';

const postsData: Record<string, { title: string; content: string; image: ImageSpecifications }> = {
	'hello-world': {
		title: 'Hello World',
		content: 'This is our first blog post. Welcome to EcoPages!',
		image: ezi76Gu53NklsuUnsplashJpg,
	},
	'browser-router': {
		title: 'Building a Browser Router',
		content: 'We built an HTML-morphing router that fetches full pages and diffs the DOM.',
		image: theodorePoncetQzephogqd7WUnsplashJpg,
	},
	'ssr-benefits': {
		title: 'SSR Benefits',
		content: 'Server-side rendering provides faster first paint and better SEO.',
		image: urbanVintage78A265Wpio4UnsplashJpg,
	},
};

type PostProps = { title: string; content: string; image: ImageSpecifications };

type PostPageProps = {
	post: PostProps | null;
};

export default eco.page<PostPageProps>({
	layout: BaseLayout,

	dependencies: {
		stylesheets: ['./post.css'],
	},

	staticPaths: async () => {
		return {
			paths: Object.keys(postsData).map((slug) => ({ params: { slug } })),
		};
	},

	staticProps: async ({ pathname }) => {
		const slug = pathname.params.slug as string;
		const post = postsData[slug] || null;
		return {
			props: {
				post,
			},
		};
	},

	metadata: ({ props }) => {
		const { post } = props;
		if (!post) {
			return {
				title: 'Post Not Found | Blog',
				description: 'The requested post could not be found.',
			};
		}
		return {
			title: `${post.title} | Blog`,
			description: post.content?.slice(0, 160),
		};
	},

	render: ({ post, params }) => {
		const slug = params?.slug as string;

		if (!post) {
			return (
				<>
					<h1>Post Not Found</h1>
					<p>Slug: {slug || 'none'}</p>
					<a href="/" class="back-link">
						← Back to Blog
					</a>
				</>
			);
		}

		return (
			<>
				<a href="/" class="back-link">
					← Back to Blog
				</a>
				<article class="post-content">
					<h1>{post.title}</h1>
					<div class="post-image-container" data-view-transition={`hero-image-${slug}`}>
						<EcoImage {...post.image} alt={post.title} />
					</div>
					<p>{post.content}</p>
				</article>
			</>
		);
	},
});
