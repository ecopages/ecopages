import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { EcoImage } from '@ecopages/image-processor/component/react';
import {
	ezi76Gu53NklsuUnsplashJpg,
	theodorePoncetQzephogqd7WUnsplashJpg,
	urbanVintage78A265Wpio4UnsplashJpg,
} from 'ecopages:images';

const posts = [
	{
		slug: 'hello-world',
		title: 'Hello World',
		excerpt: 'Welcome to EcoPages!',
		image: ezi76Gu53NklsuUnsplashJpg,
	},
	{
		slug: 'react-router',
		title: 'Building a React Router',
		excerpt: 'How we built SPA navigation.',
		image: theodorePoncetQzephogqd7WUnsplashJpg,
	},
	{
		slug: 'ssr-benefits',
		title: 'SSR Benefits',
		excerpt: 'Why server-side rendering matters.',
		image: urbanVintage78A265Wpio4UnsplashJpg,
	},
];

export default eco.page({
	layout: BaseLayout,

	dependencies: {
		stylesheets: ['./index.css'],
	},

	metadata: () => ({
		title: 'Blog | EcoPages',
		description: 'A simple blog built with EcoPages React Router',
	}),

	render: () => {
		return (
			<>
				<h1>Welcome</h1>
				<p>A minimal blog exploring EcoPages with SPA navigation.</p>

				{posts.map((post) => (
					<article key={post.slug} className="post-card">
						<a href={`/posts/${post.slug}`} className="post-card-link">
							<div className="post-card-image" data-view-transition={`hero-image-${post.slug}`}>
								<EcoImage {...post.image} alt={post.title} />
							</div>
							<div className="post-card-content">
								<h2 data-view-transition={`hero-title-${post.slug}`}>{post.title}</h2>
								<p>{post.excerpt}</p>
							</div>
						</a>
					</article>
				))}
				<article className="post-card">
					<a href="/about" className="post-card-link">
						<div className="post-card-content">
							<h2>About This Project</h2>
							<p>Learn about the EcoPages React Router.</p>
						</div>
					</a>
				</article>
				<article className="post-card">
					<a href="/mdx-example" className="post-card-link">
						<div className="post-card-content">
							<h2>MDX Example</h2>
							<p>See how MDX pages work with SPA navigation.</p>
						</div>
					</a>
				</article>

				<div style={{ marginTop: '3rem' }}></div>
			</>
		);
	},
});
