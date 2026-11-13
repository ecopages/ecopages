import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import type { ReactNode } from 'react';

import './slug.css';

export default eco.page<{}, ReactNode>({
	layout: BaseLayout,

	dependencies: {
		stylesheets: ['./slug.css'],
	},

	paths: async () => [{ params: { slug: 'test-post' } }, { params: { slug: 'another-post' } }],

	props: async () => ({}),

	render: ({ params }) => {
		const slug = params?.slug as string;
		return (
			<div data-testid="post-page">
				<h1 data-testid="post-title" data-view-transition={`post-title-${slug}`}>
					Post: {slug}
				</h1>
				<nav>
					<a href="/" data-testid="link-home">
						Back to Home
					</a>
				</nav>
			</div>
		);
	},
});
