import { getProductsByIds } from '../catalog/queries.server.ts';
import type { CatalogDb } from '../db/catalog-database.server.ts';
import { readCart, serializeCartCookie } from './cart-cookie.server.ts';
import { addToCart, cartCount, MAX_LINES, MAX_QUANTITY, setQuantity, type Cart, type CartSummary } from './cart.ts';
import { getOrder, toCartSummary } from './order.server.ts';

export type CartActionDeps = {
	db: CatalogDb;
	secret: string;
	/** Whether the cookie is sent over HTTPS only; true when the site is served over HTTPS. */
	secureCookie: boolean;
};

const ORDER_PATH = '/order';

/** `Sec-Fetch-Site` values of a request a page on this site sent, or a visitor typed. */
const SAME_SITE_FETCHES = new Set(['same-origin', 'none']);

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

/** Answers a form post with a redirect to the order page and a script with the new count. */
async function respondWithCart(request: Request, cart: Cart, deps: CartActionDeps): Promise<Response> {
	const headers = new Headers({
		'set-cookie': serializeCartCookie(cart, deps.secret, { secure: deps.secureCookie }),
	});
	if (wantsJson(request)) {
		headers.set('cache-control', 'no-store');
		const summary = toCartSummary(await getOrder(deps.db, cart));
		return Response.json(summary satisfies CartSummary, { headers });
	}
	headers.set('location', ORDER_PATH);
	return new Response(null, { status: 303, headers });
}

function readInteger(value: FormDataEntryValue | null, { min, fallback }: { min: number; fallback?: number }) {
	if ((value === null || value === '') && fallback !== undefined) return fallback;
	const number = Number(value);
	return typeof value === 'string' && Number.isSafeInteger(number) && number >= min ? number : null;
}

/**
 * Reads and checks a cart form.
 *
 * @remarks
 * A quantity of zero skips the catalog lookup, so a line whose product the catalog no longer has can still be
 * removed.
 */
async function readCartForm(
	request: Request,
	db: CatalogDb,
	defaultQuantity: number,
): Promise<{ productId: number; quantity: number } | Response> {
	if (isCrossSite(request)) return reject(request, 403, 'Cart changes must come from this site.');

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return reject(request, 400, 'Send the cart change as a form.');
	}
	const productId = readInteger(form.get('productId'), { min: 1 });
	const quantity = readInteger(form.get('quantity'), { min: 0, fallback: defaultQuantity });
	if (productId === null || quantity === null) return reject(request, 400, 'The product or quantity is not valid.');
	if (quantity === 0) return { productId, quantity };

	const [product] = await getProductsByIds(db, [productId]);
	if (!product) return reject(request, 400, 'That product is not in the catalog.');
	return { productId, quantity };
}

/**
 * `POST /cart/add`: adds `quantity` (default 1) units of `productId`.
 *
 * @remarks
 * Answers 409 when the cart limits leave nothing to add, so the button does not report an addition that did not
 * happen.
 */
export async function addToCartAction(request: Request, deps: CartActionDeps): Promise<Response> {
	const change = await readCartForm(request, deps.db, 1);
	if (change instanceof Response) return change;
	if (change.quantity === 0) return reject(request, 400, 'Add at least one unit.');
	const current = readCart(request, deps.secret);
	const cart = addToCart(current, change.productId, change.quantity);
	if (cartCount(cart) === cartCount(current)) {
		return reject(
			request,
			409,
			`Your cart is full: it holds up to ${MAX_LINES} products and ${MAX_QUANTITY} of each.`,
		);
	}
	return respondWithCart(request, cart, deps);
}

/** `POST /cart/update`: sets the quantity of `productId`; zero removes it. */
export async function updateCartAction(request: Request, deps: CartActionDeps): Promise<Response> {
	const change = await readCartForm(request, deps.db, 0);
	if (change instanceof Response) return change;
	const cart = setQuantity(readCart(request, deps.secret), change.productId, change.quantity);
	return respondWithCart(request, cart, deps);
}

/**
 * `GET /api/cart`: the unit count of the visitor's cart.
 *
 * @remarks
 * Counts the lines the order page lists, so the header and `/order` agree.
 */
export async function cartSummaryAction(request: Request, deps: CartActionDeps): Promise<Response> {
	const summary = toCartSummary(await getOrder(deps.db, readCart(request, deps.secret)));
	return Response.json(summary satisfies CartSummary, { headers: { 'cache-control': 'no-store' } });
}
