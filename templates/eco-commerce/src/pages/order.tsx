import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { OrderLines } from '@/components/order-lines/order-lines';
import { BaseLayout } from '@/layouts/base-layout/base-layout';
import { getCommerceBackend } from '@/lib/commerce/index.server';
import { formatMoney } from '@/lib/commerce/money';
import type { Cart } from '@/lib/commerce/types';
import { pageTitle } from '@/lib/store';
import { readCartToken } from '@/lib/storefront/cart-http.server';

/**
 * The visitor's cart, read on every request.
 *
 * @remarks
 * A cart cookie whose signature does not match reads as an empty cart, not an error.
 */
export default eco.page<{ cart: Cart }, JsxRenderable>({
	cache: 'dynamic',
	layout: BaseLayout,
	props: async ({ request }) => ({ cart: await getCommerceBackend().cart.getCart(readCartToken(request)) }),
	metadata: () => ({
		title: pageTitle('Your order'),
		description: 'The products in your cart.',
		robots: { index: false },
	}),
	render: ({ cart }) => (
		<>
			<header class="page-header">
				<h1>Your order</h1>
				<p>
					{cart.itemCount === 0
						? 'Your cart is empty.'
						: `${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'} in your cart.`}
				</p>
			</header>
			{cart.lines.length === 0 ? (
				<p class="empty-state">
					Nothing here yet. <a href="/">Browse the collections</a> and add something you like.
				</p>
			) : (
				<>
					<OrderLines cart={cart} />
					<div class="order-total">
						<span>Total</span>
						<strong>{formatMoney(cart.subtotal)}</strong>
					</div>
					<p class="order-note">Checkout is not part of this template.</p>
				</>
			)}
		</>
	),
});
