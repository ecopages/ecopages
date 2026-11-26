import { eco } from '@ecopages/core';
import type { ErrorPageTemplateProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { StoreLayout } from '@/layouts/store-layout/store-layout';

export default eco.page<ErrorPageTemplateProps, JsxRenderable>({
	layout: StoreLayout,
	metadata: () => ({ title: 'Not found', description: 'This page does not exist.' }),
	render: () => (
		<div class="flex max-w-prose flex-col items-start gap-4">
			<h1 class="page-title">Not found</h1>
			<p class="lede">This page does not exist, or the product is no longer sold.</p>
			<RuiButton href="/" variant="outline">
				Back to the shop
			</RuiButton>
		</div>
	),
});
