/**
 * The window event the `cart-form` host dispatches after a change, so the header count follows without a reload.
 */
export const CART_CHANGE_EVENT = 'ecoshop:cart-change';

/**
 * What `/api/cart` answers to JSON requests, and the detail of {@link CART_CHANGE_EVENT}.
 */
export type CartTotals = {
	totalQuantity: number;
	/** The formatted subtotal, or `null` for an empty cart. */
	subtotal: string | null;
};
