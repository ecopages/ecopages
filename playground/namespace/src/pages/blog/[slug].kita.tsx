import { eco } from '@ecopages/core';
import { BaseLayout } from '../../layouts/base-layout.kita';
import { getBlogPost, getAllBlogPostSlugs, getAuthor } from '../../mocks/data';
import { BackLink } from '@/components/back-link.kita';

type BlogPostProps = {
	slug: string;
	title: string;
	text: string;
	authorId: string;
	authorName: string;
};

export default eco.page<BlogPostProps>({
	layout: BaseLayout,

	staticPaths: async () => {
		return { paths: getAllBlogPostSlugs() };
	},

	staticProps: async ({ pathname }) => {
		const slug = pathname.params.slug as string;
		const post = getBlogPost(slug);
		if (!post) throw new Error(`Blog post with slug "${slug}" not found`);
		const author = getAuthor(post.authorId);
		return {
			props: {
				slug,
				title: post.title,
				text: post.text,
				authorId: post.authorId,
				authorName: author?.name ?? 'Unknown Author',
			},
		};
	},

	metadata: ({ props: { title, slug } }) => ({
		title: `${title} | Eco Namespace`,
		description: `Read the blog post: ${slug}`,
	}),

	render: ({ params, title, text, authorId, authorName }) => (
		<article class="max-w-3xl mx-auto space-y-8">
			<header class="space-y-4">
				<BackLink />
				<h1 class="text-4xl md:text-5xl font-bold text-white" safe>
					{title}
				</h1>
				<p class="text-gray-400">
					By{' '}
					<a
						href={`/blog/author/${authorId}`}
						class="text-purple-400 hover:text-purple-300 font-medium transition-colors"
						safe
					>
						{authorName}
					</a>
				</p>
			</header>

			<div class="prose prose-invert prose-lg">
				<p class="text-gray-300 leading-relaxed whitespace-pre-line" safe>
					{text}
				</p>
			</div>

			<footer class="pt-8 border-t border-white/10">
				<p class="text-sm text-gray-500">
					Slug:{' '}
					<code class="text-gray-400" safe>
						{params?.slug}
					</code>
				</p>
			</footer>
		</article>
	),
});
