import { eco } from '@ecopages/core';
import type { Error404TemplateProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page<Error404TemplateProps, JsxRenderable>({
	layout: { component: BaseLayout, props: () => ({ contained: true }) },
	dependencies: {
		stylesheets: ['./404.css'],
	},

	render: () => {
		return (
			<div class="error404">
				<h1>404 - Page Not Found</h1>
				<p>The page you are looking for does not exist.</p>
			</div>
		);
	},
});
