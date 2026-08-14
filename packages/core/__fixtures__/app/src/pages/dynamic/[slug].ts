import type { GetMetadata, GetStaticPaths, GetStaticProps, PageProps } from '@ecopages/core';
import { eco } from '@ecopages/core';
import { BaseLayout } from '../../layouts/base-layout';

export type BlogPostProps = {
	slug: string;
};

export const getStaticPaths: GetStaticPaths = async () => {
	return {
		paths: [{ params: { slug: 'blog-post' } }, { params: { slug: 'another-blog-post' } }],
	};
};

export const getStaticProps: GetStaticProps<BlogPostProps> = async ({ pathname }) => {
	return {
		props: {
			slug: pathname.params.slug as string,
		},
	};
};

export const getMetadata: GetMetadata<BlogPostProps> = async ({ params }) => {
	return {
		title: `Hello World | ${params.slug}`,
		description: 'This is a blog post',
	};
};

export default eco.page<PageProps<BlogPostProps>>({
	dependencies: {
		components: [BaseLayout],
	},
	render: ({ query, slug }) =>
		`${BaseLayout({
			children: `<div>
				<h1>Blog Post ${slug} ${JSON.stringify(query || [])}</h1>
			</div>`,
		})}`,
});
