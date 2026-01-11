import type { EcoComponent } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

import './index.css';

const IndexPage: EcoComponent = () => {
	return (
		<div data-testid="index-page">
			<h1 data-view-transition="page-title">Home</h1>
			<nav>
				<ul>
					<li>
						<a href="/about" data-testid="link-about">
							About
						</a>
					</li>
					<li>
						<a href="/posts/test-post" data-testid="link-post" data-view-transition="post-link-test-post">
							Test Post
						</a>
					</li>
					<li>
						<a href="/mdx-page" data-testid="link-mdx">
							MDX Page
						</a>
					</li>
				</ul>
			</nav>
		</div>
	);
};

IndexPage.config = {
	layout: BaseLayout,
	dependencies: {
		stylesheets: ['./index.css'],
	},
};

export default IndexPage;
