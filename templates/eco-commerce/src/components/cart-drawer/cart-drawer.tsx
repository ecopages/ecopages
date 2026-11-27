import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { RuiDialog } from '@ecopages/radiant-ui/dialog';
import './cart-drawer.css';

/** The cart drawer: a dialog the header cart link opens when JavaScript runs. */
export const CartDrawer = eco.component<{}, JsxRenderable>({
	dependencies: {
		scripts: [{ src: './cart-drawer.script.ts', lazy: { 'on:idle': true } }],
	},
	render: () => (
		<cart-drawer data-eco-persist="cart-drawer">
			<RuiDialog title="Your cart" class="cart-drawer">
				<cart-lines />
				<RuiButton href="/order" variant="filled" data-eco-reload class="cart-drawer__order">
					Review order
				</RuiButton>
			</RuiDialog>
		</cart-drawer>
	),
});
