import type { EcoComponent, GetMetadata } from '@ecopages/core';
import type { JSX } from 'react';
import { Counter } from '@/components/counter';
import { BaseLayout } from '@/layouts/base-layout';
import { EcoReactRouter } from '@ecopages/react-router';

export const getMetadata: GetMetadata = () => ({
	title: 'Blog | EcoPages',
	description: 'A simple blog built with EcoPages React Router',
});

const HomeContent = () => {
	return (
		<BaseLayout>
			<h1>Blog</h1>
			<p>Welcome to the EcoPages blog. Click a post to navigate via SPA.</p>

			<div style={{ marginTop: '2rem' }}>
				<article
					style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}
				>
					<h2>
						<a href="/about">About This Project</a>
					</h2>
					<p style={{ color: '#666' }}>Learn about the EcoPages React Router.</p>
				</article>
			</div>

			<hr style={{ margin: '2rem 0' }} />

			<h3>Interactive Counter (proves React is hydrated)</h3>
			<Counter defaultValue={0} />
		</BaseLayout>
	);
};

const HomePage: EcoComponent<unknown, JSX.Element> = (props) => {
	return (
		<EcoReactRouter initialComponent={HomeContent} initialProps={props as Record<string, any>}>
			{({ Component, props }) => <Component {...props} />}
		</EcoReactRouter>
	);
};

HomePage.config = {
	dependencies: {
		components: [Counter, BaseLayout],
	},
};

export const Content = HomeContent;

export default HomePage;
