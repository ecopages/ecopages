import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiAlert, RuiAlertDescription } from '@ecopages/radiant-ui/alert';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { RuiInput } from '@ecopages/radiant-ui/input';
import { ProductImage } from '@/components/product-image';
import { readCartId } from '@/lib/cart/cart-cookie';
import { shortageNotice, statusNotice } from '@/lib/cart/cart-messages';
import { formatMoney } from '@/lib/commerce/money';
import { getCommerce } from '@/lib/commerce/provider.server';
import { type Cart, type CartLine, DEFAULT_VARIANT_TITLE } from '@/lib/commerce/types';
import { storePaths } from '@/lib/store-urls';
import { StoreLayout } from '@/layouts/store-layout/store-layout';
import './cart.css';

type CartPageProps = { cart: Cart | null; notice: string | null };

function LineItem({ line }: { line: CartLine }): JsxRenderable {
	return (
		<li class="cart-line">
			<ProductImage image={line.image} alt={line.productTitle} sizes="6rem" class="cart-line__image" />
			<div class="cart-line__info">
				<a class="cart-line__title" href={storePaths.product(line.productHandle)}>
					{line.productTitle}
				</a>
				{line.variantTitle !== DEFAULT_VARIANT_TITLE ? (
					<p class="cart-line__variant">{line.variantTitle}</p>
				) : null}
				<p class="cart-line__unit">{formatMoney(line.unitPrice)} each</p>
			</div>
			<form method="post" action={storePaths.cartApi} class="cart-line__form">
				<input type="hidden" name="intent" value="set" />
				<input type="hidden" name="variantId" value={line.variantId} />
				<label>
					<span class="sr-only">Quantity of {line.productTitle}</span>
					<RuiInput type="number" name="quantity" value={String(line.quantity)} min="0" max="99" />
				</label>
				<RuiButton type="submit" variant="outline" size="sm">
					Update
				</RuiButton>
			</form>
			<form method="post" action={storePaths.cartApi}>
				<input type="hidden" name="intent" value="set" />
				<input type="hidden" name="variantId" value={line.variantId} />
				<input type="hidden" name="quantity" value="0" />
				<RuiButton type="submit" variant="ghost" size="sm" aria-label={`Remove ${line.productTitle}`}>
					Remove
				</RuiButton>
			</form>
			<p class="cart-line__total">{formatMoney(line.totalPrice)}</p>
		</li>
	);
}

/**
 * The shopper's cart, rendered per request from the cart cookie.
 *
 * @remarks
 * Its forms post to `/api/cart`, which redirects back here, so the page works without JavaScript.
 */
export default eco.page<CartPageProps, JsxRenderable>({
	layout: StoreLayout,
	cache: 'dynamic',
	props: async ({ request, query }) => {
		const cartId = readCartId(request.headers);
		const cart = cartId ? await getCommerce().getCart(cartId) : null;
		return { cart, notice: statusNotice(query) ?? shortageNotice(cart, query) };
	},
	metadata: () => ({ title: 'Cart', description: 'Your cart.', robots: { index: false } }),
	render: ({ cart, notice }) => (
		<div class="cart">
			<h1 class="page-title">Cart</h1>
			{notice ? (
				<RuiAlert variant="warning" layout="banner">
					<RuiAlertDescription>{notice}</RuiAlertDescription>
				</RuiAlert>
			) : null}
			{cart && cart.lines.length ? (
				<div class="cart__content">
					<ul class="cart__lines" aria-label="Cart items">
						{cart.lines.map((line) => (
							<LineItem line={line} />
						))}
					</ul>
					<aside class="cart__summary" aria-label="Order summary">
						<p class="cart__subtotal">
							<span>Subtotal</span>
							<span>{formatMoney(cart.subtotal)}</span>
						</p>
						<p class="cart__note">Shipping and taxes are calculated at checkout.</p>
						<RuiButton href={cart.checkoutUrl} class="cart__checkout">
							Check out
						</RuiButton>
					</aside>
				</div>
			) : (
				<div class="cart__empty">
					<p>Your cart is empty.</p>
					<RuiButton href="/" variant="outline">
						Continue shopping
					</RuiButton>
				</div>
			)}
		</div>
	),
});
