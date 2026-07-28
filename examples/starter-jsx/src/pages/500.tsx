import { eco } from '@ecopages/core';
import type { Error500TemplateProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page<Error500TemplateProps, JsxRenderable>({
	layout: BaseLayout,
	dependencies: {
		stylesheets: ['./500.css'],
	},

	render: ({ message, stack }) => {
		return (
			<>
				<h1>500 - Internal Server Error</h1>
				<p>{message ?? 'Something went wrong while rendering this page.'}</p>
				{stack ? <pre class="error500__stack">{stack}</pre> : null}
			</>
		);
	},
});
