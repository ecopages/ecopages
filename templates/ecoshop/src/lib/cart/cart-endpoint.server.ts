import { z } from 'zod';
import { CartInputError } from '@/lib/commerce/errors';
import { formatMoney } from '@/lib/commerce/money';
import { type Cart, type CommerceProvider, MAX_LINE_QUANTITY } from '@/lib/commerce/types';
import { isSameOriginRequest } from '@/lib/http/same-origin';
import { siteOrigin } from '@/lib/site-origin';
import { storePaths } from '@/lib/store-urls';
import { cartCookieFor, readCartId } from './cart-cookie';
import type { CartTotals } from './cart-events';

/**
 * A cart change posted by a form or the `cart-form` host. `add` adds to the line; `set` replaces its quantity, and `0`
 * removes it.
 */
export const cartActionSchema = z.discriminatedUnion('intent', [
	z.object({
		intent: z.literal('add'),
		variantId: z.string().min(1),
		quantity: z.coerce.number().int().min(1).max(MAX_LINE_QUANTITY).default(1),
	}),
	z.object({
		intent: z.literal('set'),
		variantId: z.string().min(1),
		quantity: z.coerce.number().int().min(0).max(MAX_LINE_QUANTITY),
	}),
]);

/**
 * Codes the cart page turns into a message after a form post without JavaScript.
 */
export type CartNotice = 'invalid' | 'refused';

const totals = (cart: Cart | null): CartTotals => ({
	totalQuantity: cart?.totalQuantity ?? 0,
	subtotal: cart && cart.totalQuantity > 0 ? formatMoney(cart.subtotal) : null,
});

const wantsJson = (request: Request) => (request.headers.get('accept') ?? '').includes('application/json');

/**
 * Reads the posted fields from a form or a JSON body.
 *
 * @remarks
 * The endpoint parses the body itself instead of declaring `schema.body`, because Ecopages validates only JSON and
 * plain-text bodies and answers a form post with 415, and the cart must work without JavaScript.
 */
async function readFields(request: Request): Promise<unknown> {
	const type = request.headers.get('content-type') ?? '';
	if (type.includes('application/json')) return request.json().catch(() => undefined);
	if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
		return Object.fromEntries((await request.formData()).entries());
	}
	return undefined;
}

function noticeRedirect(notice: CartNotice): Response {
	return new Response(null, { status: 303, headers: { Location: `${storePaths.cart}?notice=${notice}` } });
}

/**
 * Applies a posted cart change and answers the form (303 to `/cart`) or the `cart-form` host (JSON totals).
 */
export async function handleCartPost(request: Request, provider: CommerceProvider): Promise<Response> {
	if (!isSameOriginRequest(request, siteOrigin)) {
		return Response.json({ error: 'Origin not allowed' }, { status: 403 });
	}

	const json = wantsJson(request);
	const parsed = cartActionSchema.safeParse(await readFields(request));
	if (!parsed.success) {
		const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.') || 'body'))].join(', ');
		return json ? Response.json({ error: `Invalid ${fields}` }, { status: 400 }) : noticeRedirect('invalid');
	}

	const { intent, variantId, quantity } = parsed.data;
	const cartId = readCartId(request.headers);
	let cart: Cart;
	try {
		cart =
			intent === 'add'
				? await provider.addToCart(cartId, [{ variantId, quantity }])
				: await provider.setCartQuantities(cartId, [{ variantId, quantity }]);
	} catch (error) {
		if (!(error instanceof CartInputError)) throw error;
		return json ? Response.json({ error: error.message }, { status: 422 }) : noticeRedirect('refused');
	}

	const headers = new Headers({ 'Set-Cookie': cartCookieFor(cart.id, request), 'Cache-Control': 'no-store' });
	if (json) return Response.json(totals(cart), { headers });
	headers.set('Location', storePaths.cart);
	return new Response(null, { status: 303, headers });
}

/**
 * Answers the current cart's totals, for the cart count in the header.
 */
export async function handleCartGet(request: Request, provider: CommerceProvider): Promise<Response> {
	const cartId = readCartId(request.headers);
	const cart = cartId ? await provider.getCart(cartId) : null;
	return Response.json(totals(cart), { headers: { 'Cache-Control': 'private, no-store' } });
}
