import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { entries } from 'ecopages:content/posts';
import { getComponent, getEntryDependencies } from 'ecopages:content/posts/server';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page<{ title: string; description: string; slug: string }, JsxRenderable>({
	layout: BaseLayout,
	staticPaths: async () => ({ paths: entries.map((entry) => ({ params: { slug: entry.slug } })) }),
	staticProps: async ({ pathname }) => {
		const slug = pathname.params.slug as string;
		const entry = entries.find((candidate) => candidate.slug === slug);
		if (!entry) throw new Error(`Unknown post: ${slug}`);
		return { props: { title: entry.title, description: entry.description, slug } };
	},
	metadata: ({ props }) => ({ title: `${props.title} | Blog`, description: props.description }),
	dependencies: async ({ props }) => ({ stylesheets: ['./post.css'], ...(await getEntryDependencies(props.slug)) }),
	render: async ({ slug }) => {
		const Content = await getComponent(slug);
		return (
			<>
				<a href="/" class="back-link">
					← Back to Blog
				</a>
				<article class="post-content">{await Content()}</article>
			</>
		);
	},
});
