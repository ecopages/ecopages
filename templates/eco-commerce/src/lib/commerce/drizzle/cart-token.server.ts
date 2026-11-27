import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const CART_ID = /^[0-9a-f-]{36}$/u;

function sign(cartId: string, secret: string): string {
	return createHmac('sha256', secret).update(cartId).digest('base64url');
}

export function newCartId(): string {
	return randomUUID();
}

/** The cookie value for a cart: `<cart id>.<signature>`. */
export function encodeCartToken(cartId: string, secret: string): string {
	return `${cartId}.${sign(cartId, secret)}`;
}

/**
 * Reads the cart id from a token, or `null` when it is missing, malformed or its signature does not match.
 *
 * @remarks
 * A bad token is not an error: the visitor sees an empty cart, and the next change starts a new one. The
 * signature keeps a visitor from guessing another visitor's cart id.
 */
export function decodeCartToken(token: string | null, secret: string): string | null {
	const [cartId, signature, ...rest] = (token ?? '').split('.');
	if (!cartId || !signature || rest.length > 0 || !CART_ID.test(cartId)) return null;
	const expected = Buffer.from(sign(cartId, secret));
	const received = Buffer.from(signature);
	return expected.length === received.length && timingSafeEqual(expected, received) ? cartId : null;
}
