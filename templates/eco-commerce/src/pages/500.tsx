import { eco, isDevelopmentRuntime, type ErrorPageTemplateProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { BaseLayout } from '@/layouts/base-layout/base-layout';
import { pageTitle } from '@/lib/store';

export default eco.page<ErrorPageTemplateProps, JsxRenderable>({
	layout: BaseLayout,
	metadata: () => ({ title: pageTitle('Something went wrong'), description: 'The page failed to render.' }),
	render: ({ message }) => (
		<header class="page-header">
			<h1>Something went wrong</h1>
			<p>The page failed to render. Try again in a moment.</p>
			{isDevelopmentRuntime() && message ? <pre>{message}</pre> : null}
		</header>
	),
});
