import { sameOrigin } from '@ecopages/core';
import { z } from 'zod';
import type { CartBackend } from '../commerce/backend.ts';
import type { CartToken, CartUpdate } from '../commerce/types.ts';
import { LIMITS } from '../limits.ts';
import type { CartJson } from './json.ts';
import { cartJson } from './to-json.ts';

export const CART_COOKIE = 'store_cart';

const ORDER_PATH = '/order';

export type CartHttpDeps = {
	cart: CartBackend;
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

function reject(request: Request, status: number, message: string): Response {
	return wantsJson(request)
		? Response.json({ error: message }, { status })
		: new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

/**
 * Whether the cart cookie is marked `Secure`: when the request URL is `https`.
 *
 * @remarks
 * The server's allowed-host check makes `request.url` the address the visitor used. Behind a proxy that
 * terminates TLS the server sees plain HTTP, so set `trustProxy: { proto: true }` in `eco.config.ts` and the
 * request URL reads `X-Forwarded-Proto`.
 */
function isSecureRequest(request: Request): boolean {
	return new URL(request.url).protocol === 'https:';
}

function respond(request: Request, update: CartUpdate): Response {
	if (!update.ok) return reject(request, update.reason === 'cart-full' ? 409 : 400, update.message);
	const headers = new Headers();
	if (update.token !== null)
		headers.set('set-cookie', serializeCartCookie(update.token, { secure: isSecureRequest(request) }));
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

/**
 * The answer to a change that fails the schema: HTTP 400 with the reason, as JSON for a request that asks for it
 * and as plain text for a form without JavaScript.
 */
export function refuseInvalidChange(request: Request): Response {
	return reject(request, 400, 'The product option or quantity is not valid.');
}

/**
 * The first stage of the cart change Endpoints: it refuses a post another site started before the body is read.
 *
 * @remarks
 * Every browser posting a cart form sends `Sec-Fetch-Site` or `Origin`, so a request with neither is refused too:
 * `SameSite=Lax` keeps the cookie off a cross-site post, but one could still replace the cart with a new one.
 */
export const sameOriginOnly = sameOrigin({
	onReject: (request) => reject(request, 403, 'Cart changes must come from this site.'),
});

/** `POST /cart/add`: adds `quantity` (default 1) units of `variantId`; plain forms are redirected to `/order`. */
export async function addToCartAction(request: Request, change: CartChange, deps: CartHttpDeps): Promise<Response> {
	return respond(request, await deps.cart.addItem(readCartToken(request), change));
}

/** `POST /cart/update`: sets the quantity of `variantId`; zero removes the line. */
export async function updateCartAction(request: Request, change: CartChange, deps: CartHttpDeps): Promise<Response> {
	return respond(request, await deps.cart.updateItem(readCartToken(request), change));
}

/** `GET /api/cart`: the visitor's cart as JSON. */
export async function cartSummaryAction(request: Request, deps: Pick<CartHttpDeps, 'cart'>): Promise<Response> {
	const cart = await deps.cart.getCart(readCartToken(request));
	return Response.json(cartJson(cart) satisfies CartJson, { headers: { 'cache-control': 'no-store' } });
}
