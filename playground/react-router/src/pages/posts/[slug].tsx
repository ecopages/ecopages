import type { EcoComponent, GetMetadata } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { EcoImage } from '@ecopages/image-processor/component/react';
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
	'react-router': {
		title: 'Building a React Router',
		content: 'We built an HTML-parsing router that fetches full pages and extracts components.',
		image: theodorePoncetQzephogqd7WUnsplashJpg,
	},
	'ssr-benefits': {
		title: 'SSR Benefits',
		content: 'Server-side rendering provides faster first paint and better SEO.',
		image: urbanVintage78A265Wpio4UnsplashJpg,
	},
};

export const getMetadata: GetMetadata = ({ params }) => {
	const slug = params.slug as string;
	const post = postsData[slug] || { title: 'Not Found', content: '' };
	return {
		title: `${post.title} | Blog`,
		description: post.content?.slice(0, 160),
	};
};

type PostPageProps = {
	params: { slug: string };
	query: Record<string, string>;
};

// Shared element - uses data-view-transition for native View Transitions API
const PostImage = ({ slug, image, title }: { slug: string; image: any; title: string }) => (
	<div className="post-image-container" data-view-transition={`hero-image-${slug}`}>
		<EcoImage {...image} alt={title} />
	</div>
);

const PostTitle = ({ slug, title }: { slug: string; title: string }) => (
	<h1 data-view-transition={`hero-title-${slug}`}>{title}</h1>
);

const PostPage: EcoComponent<PostPageProps> = ({ params }) => {
	const slug = params?.slug;
	const post = slug ? postsData[slug] : null;

	if (!post) {
		return (
			<>
				<h1>Post Not Found</h1>
				<p>Slug: {slug || 'none'}</p>
				<a href="/" className="back-link">
					← Back to Blog
				</a>
			</>
		);
	}

	return (
		<>
			<a href="/" className="back-link">
				← Back to Blog
			</a>
			<article className="post-content">
				<PostTitle slug={slug} title={post.title} />
				<PostImage slug={slug} image={post.image} title={post.title} />
				<p>{post.content}</p>
			</article>
		</>
	);
};

PostPage.config = {
	layout: BaseLayout,
	dependencies: {
		stylesheets: ['./post.css'],
	},
};

export default PostPage;
