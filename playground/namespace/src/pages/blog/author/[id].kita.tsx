import { eco } from '@ecopages/core';
import { BaseLayout } from '../../../layouts/base-layout.kita';
import { getAuthor, getAllAuthorIds, getPostsByAuthor } from '../../../mocks/data';
import { BackLink } from '@/components/back-link.kita';

type AuthorPost = {
	slug: string;
	title: string;
};

type AuthorProps = {
	id: string;
	name: string;
	bio: string;
	posts: AuthorPost[];
};

export default eco.page<AuthorProps>({
	layout: BaseLayout,

	staticPaths: async () => {
		return { paths: getAllAuthorIds() };
	},

	staticProps: async ({ pathname }) => {
		const id = pathname.params.id as string;
		const author = getAuthor(id);
		if (!author) throw new Error(`Author with id "${id}" not found`);
		const posts = getPostsByAuthor(id).map((p) => ({ slug: p.slug, title: p.title }));
		return {
			props: {
				id,
				name: author.name,
				bio: author.bio,
				posts,
			},
		};
	},

	metadata: ({ props: { name } }) => ({
		title: `${name} | Author | Eco Namespace`,
		description: `Learn about author ${name}`,
	}),

	render: ({ params, name, bio, posts }) => (
		<article class="max-w-3xl mx-auto space-y-8">
			<header class="space-y-4">
				<BackLink />

				<div class="flex items-center gap-4">
					<div class="h-16 w-16 rounded-full bg-linear-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl font-bold text-white">
						{name.charAt(0)}
					</div>
					<div>
						<h1 class="text-3xl font-bold text-white" safe>
							{name}
						</h1>
						<p class="text-gray-400">
							{posts.length} post{posts.length !== 1 ? 's' : ''} published
						</p>
					</div>
				</div>
			</header>

			<section class="space-y-4">
				<h2 class="text-xl font-semibold text-white">About</h2>
				<p class="text-gray-300 leading-relaxed" safe>
					{bio}
				</p>
			</section>

			<section class="space-y-4">
				<h2 class="text-xl font-semibold text-white">Posts by {name}</h2>
				<ul class="space-y-3">
					{posts.map((post) => (
						<li>
							<a
								href={`/blog/${post.slug}`}
								class="block p-4 rounded-xl border border-white/10 bg-zinc-900/30 hover:border-purple-500/50 hover:bg-zinc-900/50 transition-colors"
							>
								<span class="text-white font-medium" safe>
									{post.title}
								</span>
								<span class="text-gray-500 text-sm ml-2">→</span>
							</a>
						</li>
					))}
				</ul>
			</section>

			<footer class="pt-8 border-t border-white/10">
				<p class="text-sm text-gray-500">
					Author ID:{' '}
					<code class="text-gray-400" safe>
						{params?.id}
					</code>
				</p>
			</footer>
		</article>
	),
});
