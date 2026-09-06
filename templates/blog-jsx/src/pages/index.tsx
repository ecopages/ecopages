import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiFeed, RuiFeedArticle } from '@ecopages/radiant-ui/feed';
import { RuiHeading, RuiHeadingDescription, RuiHeadingTitle } from '@ecopages/radiant-ui/heading';
import { EcoImage } from '@ecopages/image-processor/component/jsx';
import { entries } from 'ecopages:content/posts';
import { resolvePostImage } from '@/content/post-image';
import { BaseLayout } from '@/layouts/base-layout';
import './index.css';

export default eco.page<{}, JsxRenderable>({
	layout: { component: BaseLayout, props: () => ({ prose: false }) },
	metadata: () => ({ title: 'Blog | Ecopages', description: 'A content-driven Ecopages JSX blog.' }),
	render: () => (
		<>
			<RuiHeading size="xl">
				<RuiHeadingTitle as="h1">Welcome</RuiHeadingTitle>
				<RuiHeadingDescription>
					Walkthroughs of Ecopages, the content processor, RSS, and sitemap generation.
				</RuiHeadingDescription>
			</RuiHeading>

			<RuiFeed label="Latest posts" class="post-list unstyled">
				{entries.map((post, index) => (
					<RuiFeedArticle
						key={post.slug}
						class="post-card unstyled"
						posinset={index + 1}
						setsize={entries.length}
						tabindex={-1}
					>
						<a href={`/posts/${post.slug}`} class="post-card-link">
							<div class="post-card-image" data-view-transition={`hero-image-${post.slug}`}>
								<EcoImage
									{...resolvePostImage(post.image)}
									alt={post.title}
									width={200}
									height={140}
									unstyled
								/>
							</div>
							<div class="post-card-content">
								<h2>{post.title}</h2>
								<p>{post.excerpt}</p>
							</div>
						</a>
					</RuiFeedArticle>
				))}
			</RuiFeed>
		</>
	),
});
