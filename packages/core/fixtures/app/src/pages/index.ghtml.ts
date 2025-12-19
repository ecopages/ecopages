import { type EcoComponent, type GetMetadata, html, type PageProps } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export const getMetadata: GetMetadata = () => ({
	title: 'Home page',
	description: 'This is the homepage of the website',
	image: 'public/assets/images/default-og.png',
	keywords: ['typescript', 'framework', 'static'],
});

const HomePage: EcoComponent<PageProps> = ({ params, query }) =>
	html`!${BaseLayout({
		class: 'main-content',
		children: html`<h1 class="main-title">Home Page</h1>
			<p>!${JSON.stringify(query || [])}</p>
			<p>!${JSON.stringify(params || [])}</p>`,
	})}`;

HomePage.config = {
	dependencies: {
		stylesheets: ['./index.css'],
		components: [BaseLayout],
	},
};

export default HomePage;
