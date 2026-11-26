import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { storePaths } from '@/lib/store-urls';
import { StoreLayout } from '@/layouts/store-layout/store-layout';

/**
 * Where the demo cart's checkout URL leads. With a Shopify store, checkout is Shopify's own page.
 */
export default eco.page<{}, JsxRenderable>({
	layout: StoreLayout,
	metadata: () => ({ title: 'Checkout', description: 'Checkout in demo mode.', robots: { index: false } }),
	render: () => (
		<div class="flex max-w-prose flex-col items-start gap-4">
			<h1 class="page-title">Checkout</h1>
			<p class="lede">
				The demo catalog has no checkout. Connect a Shopify store and the cart sends shoppers to Shopify
				checkout, where payment, shipping and taxes are handled.
			</p>
			<RuiButton href={storePaths.cart} variant="outline">
				Back to cart
			</RuiButton>
		</div>
	),
});
