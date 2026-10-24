import { eco } from '@ecopages/core';
import { Suspense, type ReactNode } from 'react';
import { EcoImage } from '@ecopages/image-processor/component/react';
import { createLazyCollectionComponents } from '@ecopages/react/lazy-collection-components';
import { entries, getEntry } from 'ecopages:content/posts';
import { loadComponent } from 'ecopages:content/posts/component';
import { getEntryDependencies } from 'ecopages:content/posts/server';
import { resolvePostImage } from '@/content/post-image';
import type { PostEntry } from '@/content/posts';
import { BaseLayout } from '@/layouts/base-layout';
import './post.css';

type PostPageProps = {
	entry: PostEntry;
};

const posts = createLazyCollectionComponents(loadComponent);

export default eco.page<PostPageProps, ReactNode>({
	layout: BaseLayout,
	staticPaths: async () => ({ paths: entries.map((entry) => ({ params: { slug: entry.slug } })) }),
	staticProps: async ({ pathname }) => ({
		props: { entry: getEntry(pathname.params.slug as string) as PostEntry },
	}),
	dependencies: async ({ props }) => await getEntryDependencies(props.entry.slug),
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
					<Suspense fallback={null}>
						<Content />
					</Suspense>
				</article>
			</>
		);
	},
});
