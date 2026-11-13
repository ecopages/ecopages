import type { PageProps } from '@ecopages/core';
import { eco } from '@ecopages/core';
import { BaseLayout } from '../../layouts/base-layout';

export type BlogPostProps = {
	slug: string;
};

export default eco.page<PageProps<BlogPostProps>>({
	dependencies: {
		components: [BaseLayout],
	},

	paths: async () => {
		return [{ params: { slug: 'blog-post' } }, { params: { slug: 'another-blog-post' } }];
	},

	props: async ({ pathname }) => {
		return {
			slug: pathname.params.slug as string,
		};
	},

	metadata: async ({ params }) => {
		return {
			title: `Hello World | ${params.slug}`,
			description: 'This is a blog post',
		};
	},

	render: ({ query, slug }) =>
		`${BaseLayout({
			children: `<div>
														<h1>Blog Post ${slug} ${JSON.stringify(query || [])}</h1>
										</div>`,
		})}`,
});
