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
		description: 'This is the homepage of the website',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	}),

	render: () => {
		return (
			<BaseLayout class="main-content">
				<>
					<h1 className="main-title">React App</h1>
					<Counter defaultValue={10} />
				</>
			</BaseLayout>
		);
	},
});
