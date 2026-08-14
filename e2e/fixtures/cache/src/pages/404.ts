import { eco, type Error404TemplateProps } from '@ecopages/core';
import { BaseLayout } from '../layouts/base-layout';

const Error404 = eco.component<Error404TemplateProps>({
	dependencies: {
		stylesheets: ['./404.css'],
		components: [BaseLayout],
	},
	render: () =>
		`${BaseLayout({
			children: `<div class="error404">
				<h1>404 - Page Not Found</h1>
				<p>The page you are looking for does not exist.</p>
			</div>`,
		})}`,
});

export default Error404;
