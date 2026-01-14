import type { EcoComponent, Error404TemplateProps } from '@ecopages/core';
import { html } from '@ecopages/core/html';
import { BaseLayout } from '../layouts/base-layout';

const Error404: EcoComponent<Error404TemplateProps> = () =>
	html`!${BaseLayout({
		children: html`<div class="error404">
			<h1>404 - Page Not Found</h1>
			<p>The page you are looking for does not exist.</p>
		</div>`,
	})}`;

Error404.config = {
	dependencies: {
		stylesheets: ['./404.css'],
		components: [BaseLayout],
	},
};

export default Error404;
