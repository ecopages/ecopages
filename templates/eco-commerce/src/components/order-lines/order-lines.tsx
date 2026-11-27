import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { RuiNumberField, RuiNumberFieldGroup, RuiNumberFieldInput } from '@ecopages/radiant-ui/number-field';
import { formatMoney } from '@/lib/commerce/money';
import type { Cart } from '@/lib/commerce/types';
import { LIMITS } from '@/lib/limits';
import { productUrl } from '@/lib/storefront/urls';
import './order-lines.css';

/**
 * The order page's lines: per line, a quantity form and a remove form, both plain posts to `/cart/update`.
 *
 * @remarks
 * The quantity input inside `RuiNumberField` carries the native `name`, so the form submits it without
 * JavaScript; with it, the field adds steppers and keyboard stepping.
 */
export const OrderLines = eco.component<{ cart: Cart }, JsxRenderable>({
	dependencies: {
		scripts: ['./order-lines.script.ts'],
	},
	render: ({ cart }) => (
		<order-lines>
			<ul class="order-lines" aria-label="Cart">
				{cart.lines.map((line) => (
					<li class="order-line">
						<img src={line.thumbnail} alt="" width={80} height={80} />
						<div class="order-line__product">
							<a href={productUrl(line)}>{line.title}</a>
							<span class="order-line__unit">
								{line.variantTitle} · {formatMoney(line.unitPrice)} each
							</span>
						</div>
						<form method="post" action="/cart/update" class="order-line__quantity">
							<input type="hidden" name="variantId" value={line.variantId} />
							<label class="sr-only" for={`quantity-${line.variantId}`}>
								Quantity of {line.title}
							</label>
							<RuiNumberField
								minValue={1}
								maxValue={LIMITS.quantity}
								value={line.quantity}
								label={`Quantity of ${line.title}`}
							>
								<RuiNumberFieldGroup>
									<RuiNumberFieldInput
										id={`quantity-${line.variantId}`}
										name="quantity"
										value={String(line.quantity)}
									/>
								</RuiNumberFieldGroup>
							</RuiNumberField>
							<RuiButton type="submit" variant="outline" size="sm">
								Update
							</RuiButton>
						</form>
						<form method="post" action="/cart/update" class="order-line__remove">
							<input type="hidden" name="variantId" value={line.variantId} />
							<input type="hidden" name="quantity" value="0" />
							<RuiButton type="submit" variant="ghost" size="sm" aria-label={`Remove ${line.title}`}>
								Remove
							</RuiButton>
						</form>
						<span class="order-line__subtotal">{formatMoney(line.subtotal)}</span>
					</li>
				))}
			</ul>
		</order-lines>
	),
});
