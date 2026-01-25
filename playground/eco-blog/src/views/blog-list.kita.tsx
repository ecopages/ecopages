import { eco } from '@ecopages/core';
import { MainLayout } from '@/layouts/main-layout.kita';
import type { Post } from '@/lib/db';

export interface BlogListProps {
	posts: Post[];
}

export const BlogList = eco.page<BlogListProps>({
	layout: MainLayout,
	metadata: () => ({
		title: 'EcoBlog | Home',
		description: 'A blog about sustainability and technology',
	}),
	render: ({ posts }) => {
		return (
			<div class="max-w-3xl mx-auto space-y-12">
				<section class="text-center space-y-4 py-8">
					<h1 class="text-5xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
						Insights from the Future
					</h1>
					<p class="text-xl text-slate-500 max-w-2xl mx-auto">
						Exploring the intersection of technology, sustainability, and human craft.
					</p>
				</section>

				<div class="grid gap-12 pt-12">
					{posts.length === 0 ? (
						<div class="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
							<p class="text-slate-400">No posts yet. Start writing!</p>
						</div>
					) : (
						posts.map((post) => (
							<article class="group relative flex flex-col items-start">
								<h2 class="text-2xl font-bold tracking-tight text-slate-900 group-hover:text-indigo-600 transition-colors">
									<a href={`/posts/${post.slug}`}>
										<span class="absolute -inset-x-4 -inset-y-6 z-0 scale-95 bg-slate-100/50 opacity-0 transition group-hover:scale-100 group-hover:opacity-100 sm:-inset-x-6 sm:rounded-2xl"></span>
										<span class="relative z-10">{post.title}</span>
									</a>
								</h2>
								<time
									class="relative z-10 order-first mb-3 flex items-center text-sm text-slate-400 pl-3.5"
									datetime={post.published_at}
								>
									<span class="absolute inset-y-0 left-0 flex items-center" aria-hidden="true">
										<span class="h-4 w-0.5 rounded-full bg-slate-200"></span>
									</span>
									{new Date(post.published_at!).toLocaleDateString('en-US', {
										day: 'numeric',
										month: 'long',
										year: 'numeric',
									})}
								</time>
								<p class="relative z-10 mt-2 text-sm text-slate-600">
									{post.excerpt ||
										(post.content.length > 150
											? post.content.substring(0, 150) + '...'
											: post.content)}
								</p>
								<div
									aria-hidden="true"
									class="relative z-10 mt-4 flex items-center text-sm font-medium text-indigo-600"
								>
									Read article
									<svg
										viewBox="0 0 16 16"
										fill="none"
										aria-hidden="true"
										class="ml-1 h-4 w-4 stroke-current"
									>
										<path
											d="M6.75 5.75 9.25 8l-2.5 2.25"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										></path>
									</svg>
								</div>
							</article>
						))
					)}
				</div>
			</div>
		);
	},
});
