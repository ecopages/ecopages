import type { EcoComponent, GetMetadata } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout/base-layout.kita';

export const getMetadata: GetMetadata = () => ({
	title: 'About | Blog',
	description: 'About the EcoPages Browser Router project',
});

const AboutPage: EcoComponent = () => {
	return (
		<>
			<a href="/" class="back-link">
				← Back to Blog
			</a>

			<article class="post-content">
				<h1>About This Project</h1>
				<p>
					This is a proof-of-concept for SPA navigation in EcoPages using the Browser Router. We fetch full
					HTML, morph the DOM, and support View Transitions without a full page reload.
				</p>
			</article>

			<div style="margin-top: 3rem"></div>
		</>
	);
};

AboutPage.config = {
	layout: BaseLayout,
};

export default AboutPage;
