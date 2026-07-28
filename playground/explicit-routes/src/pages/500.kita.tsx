import { eco } from '@ecopages/core';
import type { Error500TemplateProps } from '@ecopages/core';
import { MainLayout } from '@/layouts/main-layout.kita';

export default eco.page<Error500TemplateProps>({
	dependencies: {
		stylesheets: ['./500.css'],
		components: [MainLayout],
	},

	render: ({ message, stack }) => {
		return (
			<div class="error500">
				<h1>500 - Internal Server Error</h1>
				<p>{message ?? 'Something went wrong while rendering this page.'}</p>
				{stack ? <pre class="error500__stack">{stack}</pre> : null}
			</div>
		);
	},
});
