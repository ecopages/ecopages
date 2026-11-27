import type { CartJson } from './json.ts';

/**
 * Window event that keeps the header count and the cart drawer in step with cart changes.
 *
 * @remarks
 * A `delta` is an optimistic change sent before the server answers; a `cart` is the server's answer and replaces
 * whatever the header and the drawer show.
 */
export const CART_CHANGE_EVENT = 'store:cart-change';

/** Window event that asks the cart drawer to open. */
export const OPEN_CART_EVENT = 'store:open-cart';

export type CartChangeDetail = { delta: number } | { cart: CartJson };

export function dispatchCartChange(detail: CartChangeDetail): void {
	window.dispatchEvent(new CustomEvent<CartChangeDetail>(CART_CHANGE_EVENT, { detail }));
}
