import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { storePaths } from '@/lib/store-urls';
import './cart-count.css';

/**
 * The header cart link with the live item count.
 */
export const CartLink = eco.component<{}, JsxRenderable>({
	dependencies: {
		scripts: ['./cart-count.script.ts'],
	},
	render: () => (
		<a href={storePaths.cart} class="cart-link">
			Cart
			<cart-count hidden data-eco-persist="cart-count" class="cart-count">
				<span class="sr-only">, items: </span>
				<span data-ref="value">0</span>
			</cart-count>
		</a>
	),
});
