import { eco } from '@ecopages/core';
import { entries } from 'ecopages:content/posts';
import { resolvePostImage } from '@/content/post-image';
import { BaseLayout } from '@/layouts/base-layout';
import { EcoImage } from '@ecopages/image-processor/component/react';
import './index.css';

export default eco.page({
	layout: BaseLayout,
	metadata: () => ({
		title: 'Blog | Ecopages',
		description: 'Ecopages blog template covering content collections, RSS, and sitemaps.',
	}),
	render: () => (
		<>
			<h1>Welcome</h1>
			<p>Each post explains part of this template — Ecopages routing, the content processor, and SEO export.</p>
			{entries.map((post) => (
				<article className="post-card" key={post.slug}>
					<a href={`/posts/${post.slug}`} className="post-card-link">
						<div className="post-card-image" data-view-transition={`hero-image-${post.slug}`}>
							<EcoImage {...resolvePostImage(post.image)} alt={post.title} />
						</div>
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
