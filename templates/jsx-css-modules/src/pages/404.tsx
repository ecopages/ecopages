import { eco } from '@ecopages/core';
import type { ErrorPageTemplateProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page<ErrorPageTemplateProps, JsxRenderable>({
	layout: BaseLayout,

	render: () => {
		return (
			<div>
				<h1>404 - Page Not Found</h1>
				<p>The page you are looking for does not exist.</p>
			</div>
		);
	},
});
