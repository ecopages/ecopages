import type { EcoComponent, GetMetadata } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export const getMetadata: GetMetadata = () => ({
	title: 'Blog | EcoPages',
	description: 'A simple blog built with EcoPages React Router',
});

const posts = [
	{ slug: 'hello-world', title: 'Hello World', excerpt: 'Welcome to EcoPages!' },
	{ slug: 'react-router', title: 'Building a React Router', excerpt: 'How we built SPA navigation.' },
	{ slug: 'ssr-benefits', title: 'SSR Benefits', excerpt: 'Why server-side rendering matters.' },
];

const HomePage: EcoComponent = () => {
	return (
		<>
			<h1>Welcome</h1>
			<p>A minimal blog exploring EcoPages with SPA navigation.</p>

			{posts.map((post) => (
				<article key={post.slug}>
					<h2>
						<a href={`/posts/${post.slug}`}>{post.title}</a>
					</h2>
					<p>{post.excerpt}</p>
				</article>
			))}
			<article>
				<h2>
					<a href="/about">About This Project</a>
				</h2>
				<p>Learn about the EcoPages React Router.</p>
			</article>
			<article>
				<h2>
					<a href="/mdx-example">MDX Example</a>
				</h2>
				<p>See how MDX pages work with SPA navigation.</p>
			</article>

			<div style={{ marginTop: '3rem' }}></div>
		</>
	);
};

HomePage.config = {
	layout: BaseLayout,
};

export default HomePage;
