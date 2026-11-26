import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { BaseLayout } from '@/layouts/base-layout/base-layout';
import { formatPrice, productImageUrl, productUrl } from '@/lib/catalog/urls';
import { readCart } from '@/lib/cart/cart-cookie.server';
import { MAX_QUANTITY } from '@/lib/cart/cart';
import { getCartDeps } from '@/lib/cart/cart-deps.server';
import { getOrder, type Order } from '@/lib/cart/order.server';
import './order.css';

/**
 * The visitor's cart, read from the signed cookie on every request.
 *
 * @remarks
 * Each line is a plain form that posts to `/cart/update`, so changing a quantity works without JavaScript. A
 * cookie whose signature does not match reads as an empty cart.
 */
export default eco.page<Order, JsxRenderable>({
	cache: 'dynamic',
	layout: BaseLayout,
	props: async ({ request }) => {
		const { db, secret } = await getCartDeps();
		return getOrder(db, readCart(request, secret));
	},
	metadata: () => ({
		title: 'Your order | Ecofaster',
		description: 'The products in your cart.',
		robots: { index: false },
	}),
	render: ({ lines, count, totalCents }) => (
		<>
			<header class="page-header">
				<h1>Your order</h1>
				<p>{count === 0 ? 'Your cart is empty.' : `${count} item${count === 1 ? '' : 's'} in your cart.`}</p>
			</header>
			{lines.length === 0 ? (
				<p class="empty-state">
					Nothing here yet. <a href="/">Browse the collections</a> and add something you like.
				</p>
			) : (
				<>
					<ul class="order-lines" aria-label="Cart">
						{lines.map((line) => (
							<li class="order-line">
								<img src={productImageUrl(line.product)} alt="" width={80} height={80} />
								<div class="order-line__product">
									<a href={productUrl(line.product)}>{line.product.name}</a>
									<span class="order-line__unit">{formatPrice(line.product.priceCents)} each</span>
								</div>
								<form method="post" action="/cart/update" class="order-line__quantity">
									<input type="hidden" name="productId" value={String(line.product.id)} />
									<label class="sr-only" for={`quantity-${line.product.id}`}>
										Quantity of {line.product.name}
									</label>
									<input
										id={`quantity-${line.product.id}`}
										class="order-line__input"
										type="number"
										name="quantity"
										min="0"
										max={String(MAX_QUANTITY)}
										value={String(line.quantity)}
									/>
									<RuiButton type="submit" variant="outline" size="sm">
										Update
									</RuiButton>
								</form>
								<form method="post" action="/cart/update" class="order-line__remove">
									<input type="hidden" name="productId" value={String(line.product.id)} />
									<input type="hidden" name="quantity" value="0" />
									<RuiButton
										type="submit"
										variant="ghost"
										size="sm"
										aria-label={`Remove ${line.product.name}`}
									>
										Remove
									</RuiButton>
								</form>
								<span class="order-line__subtotal">{formatPrice(line.subtotalCents)}</span>
							</li>
						))}
					</ul>
					<div class="order-total">
						<span>Total</span>
						<strong>{formatPrice(totalCents)}</strong>
					</div>
					<p class="order-note">Checkout is not part of this template; the cart lives in a signed cookie.</p>
				</>
			)}
		</>
	),
});
