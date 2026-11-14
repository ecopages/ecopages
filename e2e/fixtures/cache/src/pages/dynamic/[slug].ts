import { eco } from '@ecopages/core';
import { BaseLayout } from '../../layouts/base-layout';

export type BlogPostProps = {
	slug: string;
};

export default eco.page<BlogPostProps>({
	cache: {
		revalidate: 10,
		tags: ['blog', 'posts'],
	},
	paths: async () => {
		return [{ params: { slug: 'blog-post' } }, { params: { slug: 'another-blog-post' } }];
	},
	props: async ({ params }) => {
		return {
			slug: params.slug as string,
		};
	},
	metadata: async ({ params }) => {
		return {
			title: `Hello World | ${params.slug}`,
			description: 'This is a blog post',
		};
	},
	render: ({ query, slug }) => {
		const timestamp = Date.now();
		return `${BaseLayout({
			children: `<div>
								<h1>Blog Post ${slug} ${JSON.stringify(query || [])}</h1>
								<div id="timestamp">${timestamp}</div>
						</div>`,
		})}`;
	},
});
