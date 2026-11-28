import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiBadge } from '@ecopages/radiant-ui/badge';
import './cart-link.css';

/**
 * Header link to the order page, with the cart count once the script reads it.
 */
export const CartLink = eco.component<{}, JsxRenderable>({
	dependencies: {
		scripts: ['./cart-link.script.ts'],
	},
	render: () => (
		<cart-link data-eco-persist="cart-link">
			<a href="/order" class="cart-link" data-ref="link" aria-label="Cart">
				<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
					<path
						d="M6 7h12l-1 13H7L6 7Zm3 0a3 3 0 0 1 6 0"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linejoin="round"
					/>
				</svg>
				<span class="cart-link__label">Cart</span>
				<RuiBadge variant="filled" class="cart-link__count" data-ref="count" hidden>
					0
				</RuiBadge>
			</a>
		</cart-link>
	),
});
