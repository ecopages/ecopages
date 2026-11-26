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
 * sends, rather than comparing `Origin` with the request URL: the server builds that URL from the address it
 * listens on, not the one the visitor used, so behind a proxy the two never match. A request without the header,
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

function readQuantity(value: FormDataEntryValue | null, fallback: number): number | null {
	if (value === null || value === '') return fallback;
	const number = Number(value);
	return typeof value === 'string' && Number.isSafeInteger(number) && number >= 0 ? number : null;
}

async function readCartForm(
	request: Request,
	defaultQuantity: number,
): Promise<{ variantId: string; quantity: number } | Response> {
	if (isCrossSite(request)) return reject(request, 403, 'Cart changes must come from this site.');
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return reject(request, 400, 'Send the cart change as a form.');
	}
	const variantId = form.get('variantId');
	const quantity = readQuantity(form.get('quantity'), defaultQuantity);
	if (typeof variantId !== 'string' || !variantId || quantity === null) {
		return reject(request, 400, 'The product option or quantity is not valid.');
	}
	return { variantId, quantity };
}

/** `POST /cart/add`: adds `quantity` (default 1) units of `variantId`; plain forms are redirected to `/order`. */
export async function addToCartAction(request: Request, deps: CartHttpDeps): Promise<Response> {
	const change = await readCartForm(request, 1);
	if (change instanceof Response) return change;
	return respond(request, await deps.cart.addItem(readCartToken(request), change), deps);
}

/** `POST /cart/update`: sets the quantity of `variantId`; zero removes the line. */
export async function updateCartAction(request: Request, deps: CartHttpDeps): Promise<Response> {
	const change = await readCartForm(request, 0);
	if (change instanceof Response) return change;
	return respond(request, await deps.cart.updateItem(readCartToken(request), change), deps);
}

/** `GET /api/cart`: the visitor's cart as JSON. */
export async function cartSummaryAction(request: Request, deps: Pick<CartHttpDeps, 'cart'>): Promise<Response> {
	const cart = await deps.cart.getCart(readCartToken(request));
	return Response.json(cartJson(cart) satisfies CartJson, { headers: { 'cache-control': 'no-store' } });
}
