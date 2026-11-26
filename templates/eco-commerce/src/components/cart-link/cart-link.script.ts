import { RadiantElement, bindTo, customElement, onEvent, state } from '@ecopages/radiant';
import { CART_CHANGE_EVENT, OPEN_CART_EVENT, type CartChangeDetail } from '@/lib/storefront/cart-events';
import type { CartJson } from '@/lib/storefront/json';
import { getJson, isStoreError } from '@/lib/browser/store-api';

function describeCart(count: number): string {
	return count === 1 ? 'Cart, 1 item' : `Cart, ${count} items`;
}

/**
 * `<cart-link>`: shows the cart's item count next to the header link, and opens the cart drawer.
 *
 * @remarks
 * Pages are static and shared by every visitor, so the count is read from `/api/cart` once the element connects.
 * `CartLink` marks it `data-eco-persist`, so client navigations keep this element and its count instead of
 * fetching again. A plain click opens the drawer; a modified click, or a visit without JavaScript, follows the
 * link to the order page.
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

	/**
	 * @remarks
	 * `data-enhanced` marks the moment a click opens the drawer; until then it follows the link to `/order`.
	 */
	protected override onConnected(): void {
		this.toggleAttribute('data-enhanced', true);
		void this.refresh();
	}

	@onEvent({ ref: 'link', type: 'click' })
	onClick(event: MouseEvent): void {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
		if (!customElements.get('cart-drawer')) return;
		event.preventDefault();
		window.dispatchEvent(new CustomEvent(OPEN_CART_EVENT));
	}

	@onEvent({ window: true, type: CART_CHANGE_EVENT })
	onCartChange(event: CustomEvent<CartChangeDetail>): void {
		const { detail } = event;
		this.count = 'cart' in detail ? detail.cart.itemCount : Math.max(0, this.count + detail.delta);
	}

	private async refresh(): Promise<void> {
		const cart = await getJson<CartJson>('/api/cart', { fetch });
		if (!isStoreError(cart)) this.count = cart.itemCount;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'cart-link': CartLinkElement;
	}
}
