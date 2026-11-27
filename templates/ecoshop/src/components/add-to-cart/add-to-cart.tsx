import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { RuiNumberField } from '@ecopages/radiant-ui/number-field';
import { RuiRadio, RuiRadioGroup } from '@ecopages/radiant-ui/radio-group';
import { formatMoney } from '@/lib/commerce/money';
import { DEFAULT_VARIANT_TITLE, MAX_LINE_QUANTITY, type Product } from '@/lib/commerce/types';
import { storePaths } from '@/lib/store-urls';
import './add-to-cart.css';

const isDefaultVariant = (product: Product) =>
	product.variants.length === 1 && product.variants[0]?.title === DEFAULT_VARIANT_TITLE;

/**
 * The product form: a variant picker, a quantity and the add-to-cart button.
 *
 * @remarks
 * It posts to `/api/cart` as a plain form, so it works without JavaScript; `cart-form` upgrades it to an in-place
 * update. The variant picker is a `RuiRadioGroup` of native radios, and its server markup names them and checks the
 * first available variant, so a post without JavaScript carries the shopper's choice. A product with one variant has
 * no picker and posts it in a hidden `variantId`. The quantity is a `RuiNumberField`, whose server markup names its
 * input and carries the raw number for the same reason.
 */
export const AddToCart = eco.component<{ product: Product }, JsxRenderable>({
	dependencies: {
		scripts: ['./cart-form.script.ts'],
	},
	render: ({ product }) => {
		const firstAvailable = product.variants.find((variant) => variant.availableForSale) ?? product.variants[0];
		const pickerLabel = product.options.map((option) => option.name).join(' / ');

		return (
			<cart-form attr:success="Added to your cart">
				<form method="post" action={storePaths.cartApi} class="add-to-cart">
					<input type="hidden" name="intent" value="add" />
					{isDefaultVariant(product) ? (
						<input type="hidden" name="variantId" value={firstAvailable?.id ?? ''} />
					) : (
						<fieldset class="variant-picker">
							<legend class="variant-picker__legend">{pickerLabel}</legend>
							<RuiRadioGroup
								name="variantId"
								value={firstAvailable?.id ?? ''}
								class="variant-picker__options"
							>
								{product.variants.map((variant) => (
									<RuiRadio
										value={variant.id}
										disabled={!variant.availableForSale}
										class="variant-option"
									>
										{variant.title}
										{variant.availableForSale ? null : <span class="sr-only"> (sold out)</span>}
										{product.priceRange.min.amount === product.priceRange.max.amount ? null : (
											<span class="variant-option__price">{formatMoney(variant.price)}</span>
										)}
									</RuiRadio>
								))}
							</RuiRadioGroup>
						</fieldset>
					)}
					<div class="add-to-cart__row">
						<RuiNumberField
							name="quantity"
							label="Quantity"
							minValue={1}
							maxValue={MAX_LINE_QUANTITY}
							defaultValue={1}
							class="add-to-cart__quantity"
						/>
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
