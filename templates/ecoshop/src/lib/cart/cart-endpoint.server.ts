import { createMiddleware } from '@ecopages/core';
import { z } from 'zod';
import { CartInputError } from '@/lib/commerce/errors';
import { formatMoney } from '@/lib/commerce/money';
import { type Cart, type CommerceProvider, MAX_LINE_QUANTITY } from '@/lib/commerce/types';
import { isSameOriginRequest } from '@/lib/http/same-origin';
import { siteOrigin } from '@/lib/site-origin';
import { storePaths } from '@/lib/store-urls';
import { cartCookieFor, readCartId } from './cart-cookie';
import { noticeQuery, shortageQuery } from './cart-messages';
import type { CartTotals } from './cart-events';

/**
 * The variant a form posted. The product form carries a hidden `variantId` for a post without JavaScript and a checked
 * radio of the same name after it, so a repeated key reaches the schema as an array and the last value wins.
 */
const variantIdField = z.preprocess((value) => (Array.isArray(value) ? value.at(-1) : value), z.string().min(1));

/**
 * A cart change posted by a plain form. `add` adds to the line; `set` replaces its quantity, and `0`
 * removes it.
 */
export const cartActionSchema = z.discriminatedUnion('intent', [
	z.object({
		intent: z.literal('add'),
		variantId: variantIdField,
		quantity: z.coerce.number().int().min(1).max(MAX_LINE_QUANTITY).default(1),
	}),
	z.object({
		intent: z.literal('set'),
		variantId: variantIdField,
		quantity: z.coerce.number().int().min(0).max(MAX_LINE_QUANTITY),
	}),
]);

export type CartAction = z.output<typeof cartActionSchema>;

const totals = (cart: Cart | null): CartTotals => ({
	totalQuantity: cart?.totalQuantity ?? 0,
	subtotal: cart && cart.totalQuantity > 0 ? formatMoney(cart.subtotal) : null,
});

/**
 * Answers 403 to a post from another site, or `null` to go on.
 */
export function refuseCrossOrigin(request: Request): Response | null {
	return isSameOriginRequest(request, siteOrigin)
		? null
		: Response.json({ error: 'Origin not allowed' }, { status: 403 });
}

/**
 * The cart Endpoint's first stage: it refuses a post from another site before the body is read.
 */
export const sameOriginOnly = createMiddleware((context, next) => refuseCrossOrigin(context.request) ?? next());

/**
 * Applies a cart change the Endpoint already validated against {@link cartActionSchema}, and answers the form with a
 * 303 back to `/cart`.
 *
 * @remarks
 * Ecopages parses the form body after the route's middleware, so {@link sameOriginOnly} has already refused a post
 * from another site, and answers a change that fails the schema with HTTP 400 before this runs. The product form and
 * the agent tools add through `/api/agent-tools`, so this Endpoint serves plain form posts only.
 */
export async function handleCartPost(
	request: Request,
	provider: CommerceProvider,
	{ intent, variantId, quantity }: CartAction,
): Promise<Response> {
	const cartId = readCartId(request.headers);
	let cart: Cart;
	try {
		cart =
			intent === 'add'
				? await provider.addToCart(cartId, [{ variantId, quantity }])
				: await provider.setCartQuantities(cartId, [{ variantId, quantity }]);
	} catch (error) {
		if (!(error instanceof CartInputError)) throw error;
		return new Response(null, {
			status: 303,
			headers: { Location: `${storePaths.cart}?${noticeQuery('refused')}` },
		});
	}

	const headers = new Headers({ 'Set-Cookie': cartCookieFor(cart.id, request), 'Cache-Control': 'no-store' });
	const shortage = cart.messages?.find((message) => message.code === 'quantity_reduced');
	headers.set(
		'Location',
		shortage?.variantId && shortage.wanted
			? `${storePaths.cart}?${shortageQuery(shortage.variantId, shortage.wanted)}`
			: storePaths.cart,
	);
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
