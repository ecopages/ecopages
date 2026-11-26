export const CART_COOKIE = 'ecoshop_cart';

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * Reads the cart id from a request's `Cookie` header.
 */
export function readCartId(headers: Headers): string | undefined {
	for (const part of (headers.get('cookie') ?? '').split(';')) {
		const separator = part.indexOf('=');
		if (separator === -1 || part.slice(0, separator).trim() !== CART_COOKIE) continue;
		const value = part.slice(separator + 1).trim();
		try {
			return decodeURIComponent(value) || undefined;
		} catch {
			return undefined;
		}
	}
	return undefined;
}

/**
 * The `Set-Cookie` value that stores a cart id.
 *
 * @remarks
 * `HttpOnly` keeps the id, which grants access to the cart, away from page scripts; `SameSite=Lax` keeps it off
 * cross-site posts. Pass `secure` for an https site, and leave it off so the cookie works on `http://localhost`.
 */
export function cartCookie(cartId: string, secure: boolean): string {
	return `${CART_COOKIE}=${encodeURIComponent(cartId)}; Path=/; Max-Age=${THIRTY_DAYS}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
