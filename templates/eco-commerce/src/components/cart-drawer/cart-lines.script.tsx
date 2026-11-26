import type { JSX_PROPS, JsxRenderable } from '@ecopages/jsx';
import { RadiantElement, customElement, prop } from '@ecopages/radiant';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { RuiNumberField, RuiNumberFieldGroup, RuiNumberFieldInput } from '@ecopages/radiant-ui/number-field';
import type { CartJson } from '@/lib/storefront/json';
import { LIMITS } from '@/lib/limits';

export type CartLinesProps = { cart?: CartJson | null };

/**
 * `<cart-lines>`: renders the cart the drawer fetched.
 *
 * @remarks
 * Each line's quantity field and Remove button carry the line's `variantId`; `<cart-drawer>` listens for their
 * events and sends the change.
 */
@customElement('cart-lines')
export class CartLinesElement extends RadiantElement {
	declare readonly [JSX_PROPS]?: CartLinesProps;

	@prop<CartJson | null>({ type: Object, attribute: false })
	cart: CartJson | null = null;

	override render(): JsxRenderable {
		const cart = this.cart;
		if (!cart) return <p class="cart-lines__note">Loading your cart…</p>;
		if (cart.lines.length === 0) return <p class="cart-lines__note">Your cart is empty.</p>;
		return (
			<>
				<ul class="cart-lines">
					{cart.lines.map((line) => (
						<li class="cart-lines__line">
							<img src={line.thumbnail} alt="" width={56} height={56} />
							<div class="cart-lines__product">
								<a href={line.url}>{line.title}</a>
								<span>
									{line.variantTitle} · {line.price}
								</span>
							</div>
							<RuiNumberField
								minValue={1}
								maxValue={LIMITS.quantity}
								value={line.quantity}
								label={`Quantity of ${line.title}`}
								data-variant-id={line.variantId}
							>
								<RuiNumberFieldGroup>
									<RuiNumberFieldInput value={String(line.quantity)} />
								</RuiNumberFieldGroup>
							</RuiNumberField>
							<RuiButton
								type="button"
								variant="ghost"
								size="sm"
								data-remove={line.variantId}
								aria-label={`Remove ${line.title}`}
							>
								Remove
							</RuiButton>
						</li>
					))}
				</ul>
				<p class="cart-lines__total">
					<span>Subtotal</span>
					<strong>{cart.subtotal}</strong>
				</p>
			</>
		);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'cart-lines': CartLinesElement;
	}
}
