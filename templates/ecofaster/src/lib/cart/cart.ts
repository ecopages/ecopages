export type CartLine = {
	productId: number;
	quantity: number;
};

export type Cart = {
	lines: CartLine[];
};

export const EMPTY_CART: Cart = { lines: [] };

/** The body of a JSON cart response, read by the header count and the add-to-cart button. */
export type CartSummary = {
	count: number;
};

/**
 * Distinct products a cart holds.
 *
 * @remarks
 * Bounds the cookie, which browsers cap at about 4 KB: 50 lines of `[id,quantity]` stay well below it.
 */
export const MAX_LINES = 50;

export const MAX_QUANTITY = 99;

function clampQuantity(quantity: number): number {
	return Math.min(MAX_QUANTITY, Math.max(0, Math.trunc(quantity)));
}

/** Adds `quantity` units of a product; a new product is ignored once the cart is full. */
export function addToCart(cart: Cart, productId: number, quantity: number): Cart {
	const existing = cart.lines.find((line) => line.productId === productId);
	if (existing) {
		return setQuantity(cart, productId, existing.quantity + quantity);
	}
	if (cart.lines.length >= MAX_LINES) return cart;
	const clamped = clampQuantity(quantity);
	return clamped > 0 ? { lines: [...cart.lines, { productId, quantity: clamped }] } : cart;
}

/** Sets a line's quantity; zero removes the line. */
export function setQuantity(cart: Cart, productId: number, quantity: number): Cart {
	const clamped = clampQuantity(quantity);
	if (clamped === 0) {
		return { lines: cart.lines.filter((line) => line.productId !== productId) };
	}
	return {
		lines: cart.lines.map((line) => (line.productId === productId ? { productId, quantity: clamped } : line)),
	};
}

export function cartCount(cart: Cart): number {
	return cart.lines.reduce((total, line) => total + line.quantity, 0);
}
