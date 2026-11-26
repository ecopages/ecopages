import { cartCookieFor, readCartId } from '@/lib/cart/cart-cookie';
import { formatMoney } from '@/lib/commerce/money';
import type { CommerceProvider } from '@/lib/commerce/types';
import { isSameOriginRequest } from '@/lib/http/same-origin';
import { siteOrigin } from '@/lib/site-origin';
import type { AgentToolResponse } from './agent-tool-types';
import { findStoreTool, runStoreTool, storeToolDescriptors } from './store-tools.server';

/**
 * Lists the tools a storefront page registers with WebMCP.
 *
 * @remarks
 * The page fetches this only in a browser that has `document.modelContext`, so other visitors never download the
 * schemas. The list is the same for every visitor, so it is cacheable.
 */
export async function handleAgentToolList(): Promise<Response> {
	return Response.json(storeToolDescriptors('page'), { headers: { 'Cache-Control': 'public, max-age=300' } });
}

/**
 * Runs one WebMCP tool for the page: on the visitor's own cart, from the cart cookie, through the same definitions
 * and provider as `/mcp`.
 *
 * @remarks
 * The browser does no validation of its own: `inputSchema` is advisory for an agent, so the input is checked here,
 * where it is authoritative. `?product=<handle>` names the product of the calling page: `get_product` and
 * `show_variant` default to it, and `add_to_cart` requires it.
 */
export async function handleAgentToolCall(
	request: Request,
	name: string,
	provider: CommerceProvider,
): Promise<Response> {
	if (!isSameOriginRequest(request, siteOrigin)) {
		return Response.json({ error: 'Origin not allowed' }, { status: 403 });
	}
	if (!findStoreTool(name, 'page')) {
		return Response.json({ error: `No tool named "${name}"` }, { status: 404 });
	}

	const input: unknown = await request.json().catch(() => undefined);
	const currentProductHandle = new URL(request.url).searchParams.get('product') ?? undefined;
	const outcome = await runStoreTool(name, input, {
		provider,
		origin: siteOrigin,
		surface: 'page',
		cartId: readCartId(request.headers),
		currentProductHandle,
	});

	const headers = new Headers({ 'Cache-Control': 'no-store' });
	const body: AgentToolResponse = { result: outcome.result };
	if (outcome.cartId) headers.set('Set-Cookie', cartCookieFor(outcome.cartId, request));
	if (outcome.cart) {
		body.cart = {
			totalQuantity: outcome.cart.totalQuantity,
			subtotal: outcome.cart.totalQuantity > 0 ? formatMoney(outcome.cart.subtotal) : null,
		};
	}
	if (outcome.navigateTo) body.navigateTo = outcome.navigateTo;
	return Response.json(body, { headers });
}
