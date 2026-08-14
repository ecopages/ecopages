import type { GetMetadata, PageProps } from '@ecopages/core';
import { eco } from '@ecopages/core';
import { BaseLayout } from '../layouts/base-layout';

export const getMetadata: GetMetadata = () => ({
	title: 'Home page',
	description: 'This is the homepage of the website',
	image: 'public/assets/images/default-og.png',
	keywords: ['typescript', 'framework', 'static'],
});

export default eco.page<PageProps>({
	dependencies: {
		stylesheets: ['./index.css'],
		components: [BaseLayout],
	},
	render: ({ params, query }) =>
		`${BaseLayout({
			class: 'main-content',
			children: `<h1 class="main-title">Home Page</h1>
				<p>${JSON.stringify(query || [])}</p>
				<p>${JSON.stringify(params || [])}</p>`,
		})}`,
});
