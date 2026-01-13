import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { Counter } from '@/components/counter';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page<{}, ReactNode>({
	dependencies: {
		stylesheets: ['./index.css'],
		components: [Counter, BaseLayout],
	},

	metadata: () => ({
		title: 'Home page',
		description: 'This is the test of the website',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	}),

	render: () => {
		return (
			<BaseLayout className="main-content">
				<h1 className="main-title">Ecopages</h1>
				<a href="/about" className="text-blue-700 underline">
					Mdx
				</a>
				<a href="/" className="text-blue-700 underline">
					Home
				</a>
				<Counter defaultValue={10} />
				<Counter defaultValue={5} />
			</BaseLayout>
		);
	},
});
