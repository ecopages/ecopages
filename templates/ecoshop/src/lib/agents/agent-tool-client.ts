import { CART_CHANGE_EVENT, type CartTotals } from '../cart/cart-events';
import { navigateTo as navigate } from '../navigation';
import { productHandleFromPath, storePaths } from '../store-urls';
import type { AgentToolResponse, StoreToolResult } from './agent-tool-types';

/**
 * The cart totals as a toast describes them, such as "2 item(s) in your cart, $136.00".
 */
export function describeCartTotals(totals: CartTotals): string {
	return `${totals.totalQuantity} item(s) in your cart${totals.subtotal ? `, ${totals.subtotal}` : ''}`;
}

export interface AgentToolCallHooks {
	/** Runs after a call changed the shopper's cart, before the result is returned. */
	onCartChange?(totals: CartTotals, result: StoreToolResult): void;
	/**
	 * Called with the page a tool wants opened, before the result is returned. Return `true` when the host already
	 * shows it, such as a variant it selected in place, so no navigation follows.
	 */
	showsPage?(href: string): boolean;
}

/**
 * Runs a store tool for the host that owns it: on the server, on the shopper's own cart, then updates the page.
 *
 * @remarks
 * The header count follows a cart change before the result is returned, as WebMCP asks. A tool that opens another
 * page, or changes the cart while the cart page is open, returns its result first and then calls `navigateTo`, so
 * the agent receives it; a page of this site opens through the browser router and the persisted hosts stay
 * connected. A server error rejects, which reaches the agent as a tool error; input the schema refuses comes back as
 * a result with `isError`, naming the field, and changes nothing.
 */
export async function callAgentTool(
	name: string,
	input: unknown,
	signal: AbortSignal | undefined,
	hooks: AgentToolCallHooks = {},
): Promise<StoreToolResult> {
	const product = productHandleFromPath(location.pathname);
	const url = `${storePaths.agentTool(name)}${product ? `?product=${encodeURIComponent(product)}` : ''}`;
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify(input ?? {}),
		signal,
	});
	if (!response.ok) throw new Error(`The store could not run ${name} (${response.status}).`);
	const { result, cart, navigateTo } = (await response.json()) as AgentToolResponse;

	if (cart) {
		window.dispatchEvent(new CustomEvent<CartTotals>(CART_CHANGE_EVENT, { detail: cart }));
		hooks.onCartChange?.(cart, result);
	}
	const refreshCart = Boolean(cart) && location.pathname === storePaths.cart;
	if (navigateTo) {
		if (!hooks.showsPage?.(navigateTo)) setTimeout(() => navigate(navigateTo), 0);
	} else if (refreshCart) setTimeout(() => navigate(location.href, { replace: true }), 0);
	return result;
}
