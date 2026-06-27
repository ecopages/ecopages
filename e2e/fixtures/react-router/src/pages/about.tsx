import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import type { ReactNode } from 'react';

import './about.css';

export default eco.page<{}, ReactNode>({
	layout: BaseLayout,
	dependencies: {
		stylesheets: ['./about.css'],
	},

	render: () => (
		<div data-testid="about-page">
			<h1 data-view-transition="page-title">About</h1>
			<p>This is the about page.</p>
			<nav>
				<a href="/" data-testid="link-home">
					Back to Home
				</a>
			</nav>
		</div>
	),
});
