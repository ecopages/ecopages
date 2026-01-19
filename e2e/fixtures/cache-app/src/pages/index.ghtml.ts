import { eco } from '@ecopages/core';
import { html } from '@ecopages/core/html';
import { BaseLayout } from '../layouts/base-layout';

export default eco.page({
	metadata: () => ({
		title: 'Home page',
		description: 'This is the homepage of the website',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	}),
	dependencies: {
		stylesheets: ['./index.css'],
		components: [BaseLayout],
	},
	render: ({ params, query }) =>
		html`!${BaseLayout({
			class: 'main-content',
			children: html`<h1 class="main-title">Home Page</h1>
				<a href="/dynamic/a">Dynamic</a>
				<a href="/dynamic/b?q=query">With Query</a>
				<p>!${JSON.stringify(query || [])}</p>
				<p>!${JSON.stringify(params || [])}</p>`,
		})}`,
});
