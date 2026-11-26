import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { RuiInput } from '@ecopages/radiant-ui/input';
import { formatMoney } from '@/lib/commerce/money';
import { DEFAULT_VARIANT_TITLE, type Product } from '@/lib/commerce/types';
import { storePaths } from '@/lib/store-urls';
import './add-to-cart.css';

const isDefaultVariant = (product: Product) =>
	product.variants.length === 1 && product.variants[0]?.title === DEFAULT_VARIANT_TITLE;

/**
 * The product form: a variant picker, a quantity and the add-to-cart button.
 *
 * @remarks
 * It posts to `/api/cart` as a plain form, so it works without JavaScript; `cart-form` upgrades it to an in-place
 * update. Variants are native radios, so the picker is keyboard-operable and submits with the form before any
 * script runs.
 */
export const AddToCart = eco.component<{ product: Product }, JsxRenderable>({
	dependencies: {
		scripts: [{ src: './cart-form.script.ts', lazy: { 'on:visible': true } }],
	},
	render: ({ product }) => {
		const firstAvailable = product.variants.find((variant) => variant.availableForSale) ?? product.variants[0];
		const pickerLabel = product.options.map((option) => option.name).join(' / ');

		return (
			<cart-form attr:success="Added to your cart.">
				<form method="post" action={storePaths.cartApi} class="add-to-cart">
					<input type="hidden" name="intent" value="add" />
					{isDefaultVariant(product) ? (
						<input type="hidden" name="variantId" value={firstAvailable?.id ?? ''} />
					) : (
						<fieldset class="variant-picker">
							<legend class="variant-picker__legend">{pickerLabel}</legend>
							<div class="variant-picker__options">
								{product.variants.map((variant) => (
									<label class="variant-option">
										<input
											type="radio"
											name="variantId"
											value={variant.id}
											checked={variant.id === firstAvailable?.id}
											disabled={!variant.availableForSale}
											required
										/>
										<span class="variant-option__label">
											{variant.title}
											{variant.availableForSale ? null : <span class="sr-only"> (sold out)</span>}
										</span>
										{product.priceRange.min.amount === product.priceRange.max.amount ? null : (
											<span class="variant-option__price">{formatMoney(variant.price)}</span>
										)}
									</label>
								))}
							</div>
						</fieldset>
					)}
					<div class="add-to-cart__row">
						<label class="add-to-cart__quantity">
							<span class="sr-only">Quantity</span>
							<RuiInput type="number" name="quantity" value="1" min="1" max="99" inputmode="numeric" />
						</label>
						<RuiButton
							type="submit"
							data-ref="submit"
							disabled={!product.availableForSale}
							class="add-to-cart__submit"
						>
							{product.availableForSale ? 'Add to cart' : 'Sold out'}
						</RuiButton>
					</div>
					<p class="add-to-cart__status" data-ref="status" role="status" aria-live="polite"></p>
				</form>
			</cart-form>
		);
	},
});
