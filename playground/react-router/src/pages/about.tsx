import type { EcoComponent, GetMetadata } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export const getMetadata: GetMetadata = () => ({
	title: 'About | Blog',
	description: 'About the EcoPages React Router project',
});

const AboutPage: EcoComponent = () => {
	return (
		<>
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
		</>
	);
};

AboutPage.config = {
	layout: BaseLayout,
};

export default AboutPage;
