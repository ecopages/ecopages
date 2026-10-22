/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { Suspense, type ReactNode } from 'react';
import { createLazyCollectionComponents } from '@ecopages/react/lazy-collection-components';
import { entries, getEntry } from 'ecopages:content/posts';
import { loadComponent } from 'ecopages:content/posts/component';
import { getEntryDependencies } from 'ecopages:content/posts/server';
import type { PostContentEntry } from '@/content/posts';
import { ReactPlaygroundLayout } from '@/layouts/react-playground-layout.react';

type PostPageProps = {
	entry: PostContentEntry;
};

const posts = createLazyCollectionComponents(loadComponent);

/**
 * @remarks Fallback `ecopages:content/*` types use untyped frontmatter until collection generate runs.
 */
function asPostContentEntry(entry: (typeof entries)[number]): PostContentEntry {
	return entry as PostContentEntry;
}

export default eco.page<PostPageProps, ReactNode>({
	layout: ReactPlaygroundLayout,
	staticPaths: async () => ({ paths: entries.map((entry) => ({ params: { slug: entry.slug } })) }),
	staticProps: async ({ pathname }) => {
		const slug = String(pathname.params.slug);
		return { props: { entry: asPostContentEntry(getEntry(slug)) } };
	},
	dependencies: async ({ props }) => getEntryDependencies(props.entry.slug),
	metadata: ({ props: { entry } }) => ({
		title: `${entry.title} | Kitchen Sink`,
		description: entry.description,
	}),
	render: ({ entry }) => {
		const Content = posts.get(entry.slug);
		return (
			<div className="space-y-6" data-testid="page-post">
				<div className="flex items-center justify-between">
					<a href="/react-content" className="text-sm text-sky-600 hover:underline" data-testid="back-link">
						← Back to React Content
					</a>
					<nav className="flex gap-3 text-sm" data-testid="posts-nav">
						{entries.map((item) => (
							<a
								key={item.slug}
								href={`/posts/${item.slug}`}
								className={
									item.slug === entry.slug
										? 'font-bold underline text-on-background'
										: 'text-sky-600 hover:underline'
								}
								data-testid={`post-link-${item.slug}`}
							>
								{item.slug}
							</a>
						))}
					</nav>
				</div>
				<article className="docs-page__prose">
					<h1 data-testid="post-title">{entry.title}</h1>
					<p className="text-sm text-muted" data-testid="post-description">
						{entry.description}
					</p>
					<Suspense fallback={<p data-testid="post-loading">Loading post</p>}>
						<Content />
					</Suspense>
				</article>
			</div>
		);
	},
});
