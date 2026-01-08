import type { EcoComponent, GetMetadata } from '@ecopages/core';
import type { JSX } from 'react';
import { Counter } from '@/components/counter';
import { BaseLayout } from '@/layouts/base-layout';
import { EcoReactRouter } from '@ecopages/react-router';

export const getMetadata: GetMetadata = () => ({
	title: 'About | Blog',
	description: 'About the EcoPages React Router project',
});

const AboutContent = () => {
	return (
		<BaseLayout>
			<a href="/">← Back to Blog</a>

			<article style={{ marginTop: '1rem' }}>
				<h1>About This Project</h1>
				<p style={{ fontSize: '1.1rem', lineHeight: 1.6 }}>
					This is a proof-of-concept for SPA navigation in EcoPages. We fetch full HTML, parse it for the
					component and props, then dynamically import and render without a full page reload.
				</p>
			</article>

			<hr style={{ margin: '2rem 0' }} />

			<h3>Like this project?</h3>
			<Counter defaultValue={0} />
		</BaseLayout>
	);
};

const AboutPage: EcoComponent<unknown, JSX.Element> = (props) => {
	return (
		<EcoReactRouter initialComponent={AboutContent} initialProps={props as Record<string, any>}>
			{({ Component, props }) => <Component {...props} />}
		</EcoReactRouter>
	);
};

AboutPage.config = {
	dependencies: {
		components: [Counter, BaseLayout],
	},
};

export const Content = AboutContent;

export default AboutPage;
