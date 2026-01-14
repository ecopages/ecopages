import { eco, type Error404TemplateProps } from '@ecopages/core';
import { html } from '@ecopages/core/html';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page<Error404TemplateProps>({
	dependencies: {
		stylesheets: ['./404.css'],
		components: [BaseLayout],
	},

	render: () =>
		html`!${BaseLayout({
			children: html`<div class="error404">
				<h1>404 - Page Not Found</h1>
				<p>The page you are looking for does not exist.</p>
			</div>`,
		})}`,
});
