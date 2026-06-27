import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout.kita';

export default eco.page({
	layout: BaseLayout,

	dependencies: {
		stylesheets: ['./slug.css'],
	},

	staticPaths: async () => ({
		paths: [{ params: { slug: 'test-post' } }, { params: { slug: 'another-post' } }],
	}),

	staticProps: async () => ({ props: {} }),

	render: ({ params }) => {
		const slug = params?.slug as string;
		return (
			<div data-testid="post-page">
				<h1 data-testid="post-title">Post: {slug}</h1>
				<nav>
					<a href="/" data-testid="link-home">
						Back to Home
					</a>
				</nav>
			</div>
		);
	},
});
