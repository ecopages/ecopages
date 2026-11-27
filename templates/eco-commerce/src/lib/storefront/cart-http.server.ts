import { z } from 'zod';
import type { CartBackend } from '../commerce/backend.ts';
import type { CartToken, CartUpdate } from '../commerce/types.ts';
import { LIMITS } from '../limits.ts';
import type { CartJson } from './json.ts';
import { cartJson } from './to-json.ts';

export const CART_COOKIE = 'store_cart';

const ORDER_PATH = '/order';

/** `Sec-Fetch-Site` values of a request a page on this site sent, or a visitor typed. */
const SAME_SITE_FETCHES = new Set(['same-origin', 'none']);

export type CartHttpDeps = {
	cart: CartBackend;
	/** Whether the cookie is sent over HTTPS only; true when the site is served over HTTPS. */
	secureCookie: boolean;
};

export function readCartToken(request: Request): CartToken {
	const header = request.headers.get('cookie');
	if (!header) return null;
	for (const pair of header.split(';')) {
		const separator = pair.indexOf('=');
		if (separator !== -1 && pair.slice(0, separator).trim() === CART_COOKIE)
			return pair.slice(separator + 1).trim();
	}
	return null;
}

export function serializeCartCookie(token: string, { secure }: { secure: boolean }): string {
	const attributes = [
		`${CART_COOKIE}=${token}`,
		'Path=/',
		`Max-Age=${LIMITS.cartLifetimeSeconds}`,
		'HttpOnly',
		'SameSite=Lax',
	];
	if (secure) attributes.push('Secure');
	return attributes.join('; ');
}

function wantsJson(request: Request): boolean {
	return request.headers.get('accept')?.includes('application/json') ?? false;
}

/**
 * Whether a browser sent the request from another site.
 *
 * @remarks
 * `SameSite=Lax` already keeps the cart cookie off cross-site posts, but such a post could still replace the cart
 * with a new one, so it is refused. The check reads `Sec-Fetch-Site`, which every browser in the build targets
 * sends, rather than comparing `Origin` with the request URL: that URL carries the `Host` the proxy passes on, which
 * is not always the host the visitor used, so the comparison would depend on how the proxy is set up. A request without the header,
 * such as one from a script on the server, passes.
 */
function isCrossSite(request: Request): boolean {
	const site = request.headers.get('sec-fetch-site');
	return site !== null && !SAME_SITE_FETCHES.has(site);
}

function reject(request: Request, status: number, message: string): Response {
	return wantsJson(request)
		? Response.json({ error: message }, { status })
		: new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

function respond(request: Request, update: CartUpdate, deps: CartHttpDeps): Response {
	if (!update.ok) return reject(request, update.reason === 'cart-full' ? 409 : 400, update.message);
	const headers = new Headers();
	if (update.token !== null)
		headers.set('set-cookie', serializeCartCookie(update.token, { secure: deps.secureCookie }));
	if (wantsJson(request)) {
		headers.set('cache-control', 'no-store');
		return Response.json(cartJson(update.cart) satisfies CartJson, { headers });
	}
	headers.set('location', ORDER_PATH);
	return new Response(null, { status: 303, headers });
}

/**
 * The fields of a cart change, from a form post or a JSON body.
 *
 * @remarks
 * A form sends every field as a string, so the quantity is coerced; an empty or missing one takes `fallback`. A
 * change that fails the schema is answered with HTTP 400 before the Endpoint runs.
 */
function cartChangeSchema(fallback: number) {
	return z.object({
		variantId: z.string().min(1),
		quantity: z.union([z.literal('').transform(() => fallback), z.coerce.number().int().min(0)]).default(fallback),
	});
}

/** The body of `POST /cart/add`: `quantity` defaults to 1. */
export const addToCartSchema = cartChangeSchema(1);

/** The body of `POST /cart/update`: `quantity` defaults to 0, which removes the line. */
export const updateCartSchema = cartChangeSchema(0);

export type CartChange = z.output<typeof addToCartSchema>;

/** `POST /cart/add`: adds `quantity` (default 1) units of `variantId`; plain forms are redirected to `/order`. */
export async function addToCartAction(request: Request, change: CartChange, deps: CartHttpDeps): Promise<Response> {
	if (isCrossSite(request)) return reject(request, 403, 'Cart changes must come from this site.');
	return respond(request, await deps.cart.addItem(readCartToken(request), change), deps);
}

/** `POST /cart/update`: sets the quantity of `variantId`; zero removes the line. */
export async function updateCartAction(request: Request, change: CartChange, deps: CartHttpDeps): Promise<Response> {
	if (isCrossSite(request)) return reject(request, 403, 'Cart changes must come from this site.');
	return respond(request, await deps.cart.updateItem(readCartToken(request), change), deps);
}

/** `GET /api/cart`: the visitor's cart as JSON. */
export async function cartSummaryAction(request: Request, deps: Pick<CartHttpDeps, 'cart'>): Promise<Response> {
	const cart = await deps.cart.getCart(readCartToken(request));
	return Response.json(cartJson(cart) satisfies CartJson, { headers: { 'cache-control': 'no-store' } });
}
