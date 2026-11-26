import { RadiantElement, bindTo, customElement, onEvent, state } from '@ecopages/radiant';
import { CART_CHANGE_EVENT, type CartChangeDetail } from '@/lib/cart/cart-events';
import type { CartSummary } from '@/lib/cart/cart';

function describeCart(count: number): string {
	return count === 1 ? 'Cart, 1 item' : `Cart, ${count} items`;
}

/**
 * `<cart-link>`: shows the cart's unit count next to the header link.
 *
 * @remarks
 * Pages are static and shared by every visitor, so the count is read from `/api/cart` once the element connects.
 * `CartLink` marks it `data-eco-persist`, so client navigations keep this element and its count instead of
 * fetching again. Without JavaScript the link still opens the order page, just without a count.
 */
@customElement('cart-link')
export class CartLinkElement extends RadiantElement {
	@state
	@bindTo<number>([
		{ ref: 'count', text: true },
		{ ref: 'count', bool: 'hidden', map: (count) => count < 1 },
		{ ref: 'link', attr: 'aria-label', map: describeCart },
	])
	protected count = 0;

	protected override onConnected(): void {
		void this.refresh();
	}

	@onEvent({ window: true, type: CART_CHANGE_EVENT })
	onCartChange(event: CustomEvent<CartChangeDetail>): void {
		const { detail } = event;
		this.count = 'count' in detail ? detail.count : Math.max(0, this.count + detail.delta);
	}

	private async refresh(): Promise<void> {
		const response = await fetch('/api/cart', { headers: { accept: 'application/json' } }).catch(() => null);
		if (!response?.ok) return;
		const summary = (await response.json()) as CartSummary;
		this.count = summary.count;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'cart-link': CartLinkElement;
	}
}
