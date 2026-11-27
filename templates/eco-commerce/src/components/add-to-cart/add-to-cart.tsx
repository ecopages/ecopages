import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { RuiRadioGroup } from '@ecopages/radiant-ui/radio-group';
import {
	RuiNumberField,
	RuiNumberFieldDecrementButton,
	RuiNumberFieldGroup,
	RuiNumberFieldIncrementButton,
	RuiNumberFieldInput,
} from '@ecopages/radiant-ui/number-field';
import { RuiSpinner } from '@ecopages/radiant-ui/spinner';
import type { ProductVariant } from '@/lib/commerce/types';
import { LIMITS } from '@/lib/limits';
import './add-to-cart.css';

export type AddToCartProps = {
	variants: ProductVariant[];
};

/**
 * The product page's buy form: a finish, a quantity and the submit button.
 *
 * @remarks
 * A plain `POST /cart/add` form, so it works without JavaScript: the finish radios and the quantity input carry
 * native names. With JavaScript, `<add-to-cart>` sends it with `fetch` and offers the `add_to_cart` and
 * `select_variant` agent tools.
 */
export const AddToCart = eco.component<AddToCartProps, JsxRenderable>({
	dependencies: {
		scripts: ['./add-to-cart.script.ts'],
	},
	render: ({ variants }) => (
		<add-to-cart>
			<form method="post" action="/cart/add" class="add-to-cart" data-ref="form">
				<fieldset class="add-to-cart__variants">
					<legend>Finish</legend>
					<RuiRadioGroup
						name="variantId"
						label="Finish"
						value={variants[0]?.id}
						options={variants.map((variant) => ({ value: variant.id, label: variant.title }))}
					/>
				</fieldset>
				<div class="add-to-cart__row">
					<label class="add-to-cart__quantity">
						<span>Quantity</span>
						<RuiNumberField minValue={1} maxValue={LIMITS.quantity} defaultValue={1} label="Quantity">
							<RuiNumberFieldGroup>
								<RuiNumberFieldDecrementButton />
								<RuiNumberFieldInput name="quantity" value="1" />
								<RuiNumberFieldIncrementButton />
							</RuiNumberFieldGroup>
						</RuiNumberField>
					</label>
					<RuiButton type="submit" variant="filled" size="lg" data-ref="submit">
						<RuiSpinner size="sm" class="add-to-cart__spinner" data-ref="spinner" hidden />
						Add to cart
					</RuiButton>
				</div>
			</form>
		</add-to-cart>
	),
});
