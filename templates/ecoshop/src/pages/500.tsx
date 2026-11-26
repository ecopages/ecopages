import { eco } from '@ecopages/core';
import type { ErrorPageTemplateProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { StoreLayout } from '@/layouts/store-layout/store-layout';
import './500.css';

export default eco.page<ErrorPageTemplateProps, JsxRenderable>({
	layout: StoreLayout,
	metadata: () => ({ title: 'Something went wrong', description: 'The page could not be rendered.' }),
	render: ({ message, stack }) => (
		<div class="flex max-w-prose flex-col gap-4">
			<h1 class="page-title">Something went wrong</h1>
			<p class="lede">{message ?? 'The page could not be rendered. Try again in a moment.'}</p>
			{stack ? <pre class="error500__stack">{stack}</pre> : null}
		</div>
	),
});
