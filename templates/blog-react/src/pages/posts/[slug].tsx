import { eco, mergePageDependencies } from '@ecopages/core';
import type { ReactNode } from 'react';
import { EcoImage } from '@ecopages/image-processor/component/react';
import { createCollectionComponentCache } from '@ecopages/react/collection-component-cache';
import { entries, getEntry } from 'ecopages:content/posts';
import { loadComponent } from 'ecopages:content/posts/browser';
import { getComponent, getEntryDependencies } from 'ecopages:content/posts/server';
import { resolvePostImage } from '@/content/post-image';
import type { PostEntry } from '@/content/posts';
import { BaseLayout } from '@/layouts/base-layout';

type PostPageProps = {
	entry: PostEntry;
};

const posts = createCollectionComponentCache(loadComponent);

export async function preload({ entry }: PostPageProps): Promise<void> {
	await posts.preload(entry.slug);
}

export default eco.page<PostPageProps, ReactNode>({
	layout: BaseLayout,
	staticPaths: async () => ({ paths: entries.map((entry) => ({ params: { slug: entry.slug } })) }),
	staticProps: async ({ pathname }) => {
		const entry = getEntry(pathname.params.slug as string) as PostEntry;
		await posts.prime(entry.slug, getComponent(entry.slug));
		return { props: { entry } };
	},
	dependencies: async ({ props }) =>
		mergePageDependencies({ stylesheets: ['./post.css'] }, await getEntryDependencies(props.entry.slug)),
	metadata: ({ props: { entry } }) => ({
		title: `${entry.title} | Blog`,
		description: entry.description,
	}),
	render: ({ entry }) => {
		const Content = posts.get(entry.slug);
		return (
			<>
				<a href="/" className="back-link">
					← Back to Blog
				</a>
				<article className="post-article prose">
					<h1>{entry.title}</h1>
					<EcoImage
						{...resolvePostImage(entry.image)}
						alt={entry.title}
						className="post-image-float"
						data-view-transition={`hero-image-${entry.slug}`}
					/>
					<Content />
				</article>
			</>
		);
	},
});
