import type { EcoComponent } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

import './about.css';

const AboutPage: EcoComponent = () => {
	return (
		<div data-testid="about-page">
			<h1 data-view-transition="page-title">About</h1>
			<p>This is the about page.</p>
			<nav>
				<a href="/" data-testid="link-home">
					Back to Home
				</a>
			</nav>
		</div>
	);
};

AboutPage.config = {
	layout: BaseLayout,
	dependencies: {
		stylesheets: ['./about.css'],
	},
};

export default AboutPage;
