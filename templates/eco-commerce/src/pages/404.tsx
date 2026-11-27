import { eco, type ErrorPageTemplateProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { BaseLayout } from '@/layouts/base-layout/base-layout';
import { pageTitle } from '@/lib/store';

export default eco.page<ErrorPageTemplateProps, JsxRenderable>({
	layout: BaseLayout,
	metadata: () => ({ title: pageTitle('Not found'), description: 'This page does not exist.' }),
	render: () => (
		<header class="page-header">
			<h1>Not found</h1>
			<p>
				We could not find that page. <a href="/">Go back to the collections</a> or search for a product above.
			</p>
		</header>
	),
});
