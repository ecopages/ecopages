/**
 * Window event that keeps the header cart count in step with the add-to-cart buttons.
 *
 * @remarks
 * A `delta` is an optimistic change sent before the server answers; a `count` is the server's total and replaces
 * whatever the header shows.
 */
export const CART_CHANGE_EVENT = 'ecofaster:cart-change';

export type CartChangeDetail = { delta: number } | { count: number };

export function dispatchCartChange(detail: CartChangeDetail): void {
	window.dispatchEvent(new CustomEvent<CartChangeDetail>(CART_CHANGE_EVENT, { detail }));
}
