import { eco } from '@ecopages/core';
import { entries } from 'ecopages:content/posts';
import { BaseLayout } from '@/layouts/base-layout';
import { EcoImage } from '@ecopages/image-processor/component/react';
import { ezi76Gu53NklsuUnsplashJpg } from 'ecopages:images';

export default eco.page({
	layout: BaseLayout,
	dependencies: { stylesheets: ['./index.css'] },
	metadata: () => ({ title: 'Blog | Ecopages', description: 'A content-driven Ecopages React blog.' }),
	render: () => (
		<>
			<h1>Welcome</h1>
			<p>A content-driven blog powered by the Ecopages content processor.</p>
			{entries.map((post, index) => (
				<article className="post-card" key={post.slug}>
					<a href={`/posts/${post.slug}`} className="post-card-link">
						{index === 0 ? (
							<div className="post-card-image" data-view-transition={`hero-image-${post.slug}`}>
								<EcoImage {...ezi76Gu53NklsuUnsplashJpg} alt={post.title} />
							</div>
						) : null}
						<div className="post-card-content">
							<h2>{post.title}</h2>
							<p>{post.excerpt}</p>
						</div>
					</a>
				</article>
			))}
		</>
	),
});
