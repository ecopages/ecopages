import type { Error500TemplateProps } from '@ecopages/core';
import { eco } from '@ecopages/core';
import { BaseLayout } from '../layouts/base-layout';

export default eco.page<Error500TemplateProps>({
	dependencies: {
		components: [BaseLayout],
	},
	render: ({ message, stack }) =>
		`${BaseLayout({
			children: `<div class="error500">
				<h1>500 - Internal Server Error</h1>
				<p>${message ?? 'Something went wrong while rendering this page.'}</p>
				${stack ? `<pre class="error500__stack">${stack}</pre>` : ''}
			</div>`,
		})}`,
});
