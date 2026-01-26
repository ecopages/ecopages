import { eco } from '@ecopages/core';
import { MainLayout } from '@/layouts/main-layout.kita';
import type { Post } from '@/lib/db';
import { evaluate } from '@mdx-js/mdx';
import * as runtime from '@kitajs/html/jsx-runtime';
import Html from '@kitajs/html';

export interface BlogDetailProps {
	post: Post;
}

export const BlogDetail = eco.page<BlogDetailProps>({
	layout: MainLayout,
	cache: 'dynamic',
	metadata: ({ props }) => ({
		title: `${props.post.title} | EcoBlog`,
		description: props.post.excerpt || 'Read this interesting post on EcoBlog',
	}),
	render: async ({ post }) => {
		const { default: MDXContent } = await evaluate(post.content, runtime as any);
		return (
			<article class="max-w-3xl mx-auto py-12">
				<header class="flex flex-col mb-12">
					<time
						class="order-first flex items-center text-base text-slate-400 mb-4"
						datetime={post.published_at!}
					>
						<span class="h-4 w-0.5 rounded-full bg-slate-200 mr-3"></span>
						{new Date(post.published_at!).toLocaleDateString('en-US', {
							day: 'numeric',
							month: 'long',
							year: 'numeric',
						})}
					</time>
					<h1 class="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">{post.title}</h1>
				</header>
				<div class="prose prose-slate prose-indigo max-w-none prose-headings:font-bold prose-a:text-indigo-600">
					{Html.contentsToString([MDXContent({})])}
				</div>
			</article>
		);
	},
});
