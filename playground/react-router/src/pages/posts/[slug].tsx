import type { EcoComponent, GetMetadata, GetStaticPaths, GetStaticProps, PageProps } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { EcoImage } from '@ecopages/image-processor/component/react';
import {
	ezi76Gu53NklsuUnsplashJpg,
	theodorePoncetQzephogqd7WUnsplashJpg,
	urbanVintage78A265Wpio4UnsplashJpg,
} from 'ecopages:images';
import type { ImageSpecifications } from '@ecopages/image-processor';

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

type PostProps = { title: string; content: string; image: ImageSpecifications };

type PostPageProps = {
	post: PostProps | null;
};

export const getStaticPaths: GetStaticPaths = async () => {
	return {
		paths: Object.keys(postsData).map((slug) => ({ params: { slug } })),
	};
};

export const getStaticProps: GetStaticProps<PostPageProps> = async ({ pathname }) => {
	const slug = pathname.params.slug as string;
	const post = postsData[slug] || null;
	return {
		props: {
			post,
		},
	};
};

export const getMetadata: GetMetadata<PostPageProps> = ({ props }) => {
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
};

const PostPage: EcoComponent<PageProps<PostPageProps>> = ({ post, params }) => {
	const slug = params?.slug as string;

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
				<h1>{post.title}</h1>
				<div className="post-image-container" data-view-transition={`hero-image-${slug}`}>
					<EcoImage {...post.image} alt={post.title} />
				</div>
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
