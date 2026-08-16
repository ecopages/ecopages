import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { entries } from 'ecopages:content/posts';
import { BaseLayout } from '@/layouts/base-layout';
import HelloWorld from '@/content/posts/hello-world.mdx';
import BrowserRouter from '@/content/posts/browser-router.mdx';
import SsrBenefits from '@/content/posts/ssr-benefits.mdx';

const postComponents = {
	'hello-world': HelloWorld,
	'browser-router': BrowserRouter,
	'ssr-benefits': SsrBenefits,
};

export function postPage(slug: string) {
	const entry = entries.find((candidate) => candidate.slug === slug);
	const Content = postComponents[slug as keyof typeof postComponents];

	return eco.page<{}, ReactNode>({
		layout: BaseLayout,
		dependencies: { stylesheets: ['../pages/posts/post.css'] },
		metadata: () => ({
			title: `${entry?.title ?? 'Post Not Found'} | Blog`,
			description: entry?.description ?? 'The requested post could not be found.',
		}),
		render: () => (
			<>
				<a href="/" className="back-link">
					← Back to Blog
				</a>
				<article className="post-content">
					<h1>{entry?.title ?? 'Post Not Found'}</h1>
					{Content ? <Content /> : <p>The requested post could not be found.</p>}
				</article>
			</>
		),
	});
}
