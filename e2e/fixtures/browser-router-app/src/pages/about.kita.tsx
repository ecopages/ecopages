import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout.kita';

import './about.css';

export default eco.page({
	layout: BaseLayout,

	dependencies: {
		stylesheets: ['./about.css'],
	},

	render: () => (
		<div data-testid="about-page">
			<h1>About</h1>
			<p>This is the about page.</p>
			<nav>
				<a href="/" data-testid="link-home">
					Back to Home
				</a>
			</nav>
		</div>
	),
});
