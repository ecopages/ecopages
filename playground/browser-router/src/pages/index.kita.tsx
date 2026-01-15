import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout/base-layout.kita';
import { EcoImage } from '@ecopages/image-processor/component/html';
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
		slug: 'browser-router',
		title: 'Building a Browser Router',
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
		description: 'A simple blog built with EcoPages Browser Router',
	}),

	render: () => {
		return (
			<>
				<h1>Welcome</h1>
				<p>A minimal blog exploring EcoPages with SPA navigation.</p>

				{posts.map((post) => (
					<article class="post-card">
						<a href={`/posts/${post.slug}`} class="post-card-link">
							<div class="post-card-image" data-view-transition={`hero-image-${post.slug}`}>
								<EcoImage {...post.image} alt={post.title} />
							</div>
							<div class="post-card-content">
								<h2 data-view-transition={`hero-title-${post.slug}`}>{post.title}</h2>
								<p>{post.excerpt}</p>
							</div>
						</a>
					</article>
				))}
				<article class="post-card">
					<a href="/about" class="post-card-link">
						<div class="post-card-content">
							<h2>About This Project</h2>
							<p>Learn about the EcoPages Browser Router.</p>
						</div>
					</a>
				</article>
				<article class="post-card">
					<a href="/mdx-example" class="post-card-link">
						<div class="post-card-content">
							<h2>MDX Example</h2>
							<p>See how MDX works with the Browser Router.</p>
						</div>
					</a>
				</article>

				<div style="margin-top: 3rem"></div>
			</>
		);
	},
});
