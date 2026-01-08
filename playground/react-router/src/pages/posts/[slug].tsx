import type { EcoComponent, GetMetadata } from '@ecopages/core';
import type { JSX } from 'react';
import { BaseLayout } from '@/layouts/base-layout';
import { EcoReactRouter } from '@ecopages/react-router';
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

const PostContent = ({ params }: PostPageProps) => {
	const slug = params?.slug;
	const post = slug ? postsData[slug] : null;

	if (!post) {
		return (
			<BaseLayout>
				<h1>Post Not Found</h1>
				<p>Slug: {slug || 'none'}</p>
				<a href="/" className="back-link">
					← Back to Blog
				</a>
			</BaseLayout>
		);
	}

	return (
		<BaseLayout>
			<a href="/" className="back-link">
				← Back to Blog
			</a>
			<article className="post-content">
				<h1>{post.title}</h1>
				<div className="post-image-container">
					<EcoImage {...post.image} alt={post.title} />
				</div>
				<p>{post.content}</p>
			</article>

			<div style={{ marginTop: '3rem' }}></div>
		</BaseLayout>
	);
};

const PostPage: EcoComponent<PostPageProps, JSX.Element> = (props) => {
	return (
		<EcoReactRouter initialComponent={PostContent} initialProps={props}>
			{({ Component, props }) => <Component {...props} />}
		</EcoReactRouter>
	);
};

PostPage.config = {
	dependencies: {
		components: [BaseLayout],
	},
};

export const Content = PostContent;

export default PostPage;
