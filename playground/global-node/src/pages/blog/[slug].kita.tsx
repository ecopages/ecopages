import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { getAllBlogPostSlugs, getBlogPost } from '@/mocks/data';

export type BlogPostProps = {
	slug: string;
	title: string;
	text: string;
};

export default eco.page<BlogPostProps>({
	dependencies: { components: [BaseLayout] },

	staticPaths: async () => {
		return { paths: getAllBlogPostSlugs() };
	},

	staticProps: async ({ pathname }) => {
		const slug = pathname.params.slug as string;
		const blogPost = getBlogPost(slug);
		if (!blogPost) throw new Error(`Blog post with slug "${slug}" not found`);
		return {
			props: {
				slug,
				title: blogPost.title,
				text: blogPost.text,
			},
		};
	},

	metadata: async ({ props: { title, slug } }) => {
		return {
			title,
			description: `This is a blog post with the slug ${slug}`,
		};
	},

	layout: BaseLayout,

	render: ({ params, query, title, text, slug }) => {
		return (
			<div>
				<h1 safe>
					Blog Post {params?.slug} {JSON.stringify(query || [])}
				</h1>
				<h2 safe>{title}</h2>
				<p safe>{text}</p>
				<p safe>{slug}</p>
			</div>
		);
	},
});
