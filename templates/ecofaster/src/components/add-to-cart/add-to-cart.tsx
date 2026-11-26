import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import './add-to-cart.css';

export type AddToCartProps = {
	productId: number;
};

export const AddToCart = eco.component<AddToCartProps, JsxRenderable>({
	dependencies: {
		scripts: ['./add-to-cart.script.ts'],
	},
	render: ({ productId }) => (
		<add-to-cart>
			<form method="post" action="/cart/add" class="add-to-cart" data-ref="form">
				<input type="hidden" name="productId" value={String(productId)} />
				<RuiButton type="submit" variant="filled" size="lg" data-ref="submit">
					Add to cart
				</RuiButton>
				<p class="add-to-cart__status" data-ref="status" role="status" />
			</form>
		</add-to-cart>
	),
});
