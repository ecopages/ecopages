import type { EcoComponent, Error500TemplateProps } from '@ecopages/core';
import { html } from '@ecopages/core/html';
import { BaseLayout } from '../layouts/base-layout';

const Error500: EcoComponent<Error500TemplateProps> = ({ message, stack }) =>
	html`!${BaseLayout({
		children: html`<div class="error500">
			<h1>500 - Internal Server Error</h1>
			<p>${message ?? 'Something went wrong while rendering this page.'}</p>
			${stack ? html`<pre class="error500__stack">${stack}</pre>` : ''}
		</div>`,
	})}`;

Error500.config = {
	dependencies: {
		components: [BaseLayout],
	},
};

export default Error500;
