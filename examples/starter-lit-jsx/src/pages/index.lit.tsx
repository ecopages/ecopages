import { eco } from '@ecopages/core';
import { Card } from '@/components/card';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page({
	dependencies: {
		stylesheets: ['./index.css'],
		components: [BaseLayout, Card],
	},

	metadata: () => ({
		title: 'Home page',
		description: 'This is the homepage of the website',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	}),

	render: () => {
		return (
			<BaseLayout class="main-content">
				<>
					<h1 class="main-title">Ecopages</h1>
					<a href="/about">Mdx</a>
					<Card title="Card title" copy="Card copy" />
				</>
			</BaseLayout>
		);
	},
});
