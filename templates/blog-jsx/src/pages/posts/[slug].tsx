import { eco, mergePageDependencies } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { EcoImage } from '@ecopages/image-processor/component/jsx';
import type { PostEntry, PostFrontmatter } from '@/content/posts';
import { resolvePostImage } from '@/content/post-image';
import { entries, getEntry } from 'ecopages:content/posts';
import { getComponent, getEntryDependencies } from 'ecopages:content/posts/server';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page<
	{ title: string; description: string; slug: string; image: PostFrontmatter['image'] },
	JsxRenderable
>({
	layout: { component: BaseLayout, props: () => ({ prose: true }) },
	staticPaths: async () => ({ paths: entries.map((entry) => ({ params: { slug: entry.slug } })) }),
	staticProps: async ({ pathname }) => {
		const slug = pathname.params.slug as string;
		const entry = getEntry(slug) as PostEntry;
		return { props: { title: entry.title, description: entry.description, slug, image: entry.image } };
	},
	metadata: ({ props }) => ({ title: `${props.title} | Blog`, description: props.description }),
	dependencies: async ({ props }) =>
		mergePageDependencies({ stylesheets: ['./post.css'] }, await getEntryDependencies(props.slug)),
	render: async ({ slug, title, image }) => {
		const Content = await getComponent(slug);
		return (
			<>
				<RuiButton href="/" variant="ghost" size="sm" class="back-link unstyled">
					← Back to Blog
				</RuiButton>
				<article class="post-article">
					<h1>{title}</h1>
					<EcoImage
						{...resolvePostImage(image)}
						alt={title}
						class="post-image-float"
						width={192}
						height={144}
						unstyled
						data-view-transition={`hero-image-${slug}`}
					/>
					{await Content({})}
				</article>
			</>
		);
	},
});
