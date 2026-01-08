import type { EcoComponent, GetMetadata } from '@ecopages/core';
import type { JSX } from 'react';
import { BaseLayout } from '@/layouts/base-layout';
import { EcoReactRouter } from '@ecopages/react-router';

export const getMetadata: GetMetadata = () => ({
	title: 'About | Blog',
	description: 'About the EcoPages React Router project',
});

const AboutContent = () => {
	return (
		<BaseLayout>
			<a href="/" className="back-link">
				← Back to Blog
			</a>

			<article className="post-content">
				<h1>About This Project</h1>
				<p>
					This is a proof-of-concept for SPA navigation in EcoPages. We fetch full HTML, parse it for the
					component and props, then dynamically import and render without a full page reload.
				</p>
			</article>

			<div style={{ marginTop: '3rem' }}></div>
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
		components: [BaseLayout],
	},
};

export const Content = AboutContent;

export default AboutPage;
