import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { RuiInput } from '@ecopages/radiant-ui/input';
import { RuiRadio, RuiRadioGroup } from '@ecopages/radiant-ui/radio-group';
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
 * update. The variant picker is a `RuiRadioGroup` of native radios. Its host checks the selected radio only once its
 * script runs, so a hidden `variantId` before the group carries the first available variant for a post without
 * JavaScript; a checked radio comes later in the form and wins. The quantity stays a native number input: Radiant
 * UI's number field names its input only once its script runs, so a post without JavaScript would lose it.
 */
export const AddToCart = eco.component<{ product: Product }, JsxRenderable>({
	dependencies: {
		scripts: ['./cart-form.script.ts'],
	},
	render: ({ product }) => {
		const firstAvailable = product.variants.find((variant) => variant.availableForSale) ?? product.variants[0];
		const pickerLabel = product.options.map((option) => option.name).join(' / ');

		return (
			<cart-form attr:success="Added to your cart" attr:product-title={product.title}>
				<form method="post" action={storePaths.cartApi} class="add-to-cart">
					<input type="hidden" name="intent" value="add" />
					<input type="hidden" name="variantId" value={firstAvailable?.id ?? ''} />
					{isDefaultVariant(product) ? null : (
						<fieldset class="variant-picker">
							<legend class="variant-picker__legend">{pickerLabel}</legend>
							<RuiRadioGroup
								name="variantId"
								value={firstAvailable?.id ?? ''}
								label={pickerLabel}
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
