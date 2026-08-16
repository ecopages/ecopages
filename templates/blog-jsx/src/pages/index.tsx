import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { entries } from 'ecopages:content/posts';
import { createMarkupNodeLike } from '@ecopages/jsx';
import { EcoImage as renderEcoImage } from '@ecopages/image-processor/component/html';
import { BaseLayout } from '@/layouts/base-layout';
import { ezi76Gu53NklsuUnsplashJpg } from 'ecopages:images';

export default eco.page<{}, JsxRenderable>({
	layout: BaseLayout,
	dependencies: { stylesheets: ['./index.css'] },
	metadata: () => ({ title: 'Blog | Ecopages', description: 'A content-driven Ecopages JSX blog.' }),
	render: () => (
		<>
			<h1>Welcome</h1>
			<p>A content-driven blog powered by the Ecopages content processor.</p>
			{entries.map((post, index) => (
				<article class="post-card" key={post.slug}>
					<a href={`/posts/${post.slug}`} class="post-card-link">
						{index === 0 ? (
							<div class="post-card-image" data-view-transition={`hero-image-${post.slug}`}>
								{createMarkupNodeLike(
									renderEcoImage({ ...ezi76Gu53NklsuUnsplashJpg, alt: post.title }),
								)}
							</div>
						) : null}
						<div class="post-card-content">
							<h2>{post.title}</h2>
							<p>{post.excerpt}</p>
						</div>
					</a>
				</article>
			))}
		</>
	),
});
