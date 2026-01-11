import type { EcoComponent } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout.kita';

import './index.css';

const IndexPage: EcoComponent = () => {
	return (
		<main data-testid="index-page">
			<h1>Home</h1>
			<nav>
				<ul>
					<li>
						<a href="/about" data-testid="link-about">
							About
						</a>
					</li>
					<li>
						<a href="/posts/test-post" data-testid="link-post">
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
		</main>
	);
};

IndexPage.config = {
	layout: BaseLayout,
	dependencies: {
		stylesheets: ['./index.css'],
	},
};

export default IndexPage;
