import type { EcoComponent, GetMetadata } from '@ecopages/core';
import { Card } from '@/components/card';
import { BaseLayout } from '@/layouts/base-layout';

export const getMetadata: GetMetadata = () => ({
	title: 'Home page',
	description: 'This is the homepage of the website',
	image: 'public/assets/images/default-og.png',
	keywords: ['typescript', 'framework', 'static'],
});

const HomePage: EcoComponent = () => {
	return (
		<BaseLayout class="main-content">
			<>
				<h1 class="main-title">Ecopages</h1>
				<a href="/about">Mdx</a>
				<Card title="Card title" copy="Card copy" />
			</>
		</BaseLayout>
	);
};

HomePage.config = {
	dependencies: {
		stylesheets: ['./index.css'],
		components: [BaseLayout, Card],
	},
};

export default HomePage;
