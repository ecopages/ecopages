import { cartCookieFor, readCartId } from '@/lib/cart/cart-cookie';
import { formatMoney } from '@/lib/commerce/money';
import type { CommerceProvider } from '@/lib/commerce/types';
import type { AgentToolResponse } from './agent-tool-types';
import { findStoreTool, runStoreTool } from './store-tools.server';

/**
 * Runs one WebMCP tool for the page: on the visitor's own cart, from the cart cookie, through the same definitions
 * and provider as `/mcp`.
 *
 * @remarks
 * The input is validated here, with the Zod schema of the definition, and only here: the host that registered the tool
 * sends an agent's input as it came, since a browser check would put the schema library in every page and a request
 * can skip the browser anyway. Input the schema refuses comes back as a tool error naming the first invalid fields. Ecopages has
 * already refused a request from another site and read the JSON `input` within `maxRequestBodySize`. Results carry
 * URLs on the origin of the request, which the server's allowed-host check makes the address the visitor used, so the
 * page opens them on the host that serves it.
 * `?product=<handle>` names the product of the calling page: `get_product` and `show_variant` default to it, and
 * `add_to_cart` requires it.
 */
export async function handleAgentToolCall(
	request: Request,
	name: string,
	provider: CommerceProvider,
	input: unknown,
): Promise<Response> {
	if (!findStoreTool(name, 'page')) {
		return Response.json({ error: `No tool named "${name}"` }, { status: 404 });
	}

	const currentProductHandle = new URL(request.url).searchParams.get('product') ?? undefined;
	const outcome = await runStoreTool(name, input, {
		provider,
		origin: new URL(request.url).origin,
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
