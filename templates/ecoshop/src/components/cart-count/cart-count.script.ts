import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import { RadiantElement, bindTo, customElement, onEvent, state } from '@ecopages/radiant';
import { CART_CHANGE_EVENT, type CartTotals } from '../../lib/cart/cart-events';
import { storePaths } from '../../lib/store-urls';

/**
 * The number of items in the cart, next to the header's cart link.
 *
 * @remarks
 * Catalog pages are cached and shared by every shopper, so the server cannot render a shopper's count into them.
 * The host reads it from `/api/cart` once, then follows {@link CART_CHANGE_EVENT}. Without JavaScript it stays
 * hidden and the cart link still works.
 */
@customElement('cart-count')
export class CartCount extends RadiantElement {
	@state
	@bindTo<number>([
		{ ref: 'value', text: true },
		{ bool: 'hidden', map: (count) => count === 0 },
	])
	protected count = 0;

	/** Whether a cart change arrived, which makes a slower initial load stale. */
	private changed = false;

	protected override onConnected(): void {
		void this.load();
	}

	@onEvent({ window: true, type: CART_CHANGE_EVENT })
	onCartChange(event: CustomEvent<CartTotals>) {
		this.changed = true;
		this.count = event.detail.totalQuantity;
	}

	/**
	 * @remarks
	 * A failed request leaves the count hidden: the cart link still works.
	 */
	private async load(): Promise<void> {
		this.changed = false;
		const response = await fetch(storePaths.cartApi, { headers: { Accept: 'application/json' } }).catch(() => null);
		if (!response?.ok) return;
		const totals = (await response.json().catch(() => null)) as CartTotals | null;
		if (totals && !this.changed) this.count = totals.totalQuantity;
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'cart-count': JsxCustomElementAttributes<CartCount, {}>;
	}
}
