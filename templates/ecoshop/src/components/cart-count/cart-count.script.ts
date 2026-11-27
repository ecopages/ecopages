import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import { RadiantElement, bindTo, customElement, onEvent, state } from '@ecopages/radiant';
import { agentTool } from '@ecopages/radiant/decorators/agent-tool';
import type { AgentToolExecuteOptions } from '@ecopages/radiant/helpers/register-agent-tool';
import { callAgentTool } from '../../lib/agents/agent-tool-client';
import { announceAssistantCartChange } from '../../lib/agents/assistant-cart-change';
import { agentToolConfig, type ToolInputOf } from '../../lib/agents/agent-tool-config';
import { cancelCartInfo, getCartInfo, proceedToCheckoutInfo, updateCartInfo } from '../../lib/agents/store-tool-info';
import { CART_CHANGE_EVENT, type CartTotals } from '../../lib/cart/cart-events';
import { storePaths } from '../../lib/store-urls';

/**
 * The number of items in the cart, next to the header's cart link, and the host of the cart tools an agent reads and
 * changes the cart with.
 *
 * @remarks
 * Catalog pages are cached and shared by every shopper, so the server cannot render a shopper's count into them.
 * The host reads it from `/api/cart` once, then follows {@link CART_CHANGE_EVENT}, which the add button and every
 * cart tool dispatch. Without JavaScript it stays hidden and the cart link still works.
 *
 * It sits in the layout with `data-eco-persist`, so its tools (`get_cart`, `update_cart`, `cancel_cart` and
 * `proceed_to_checkout`) stay registered on every page. The cart page's forms are plain forms that post to
 * `/api/cart`, so no UI method stands behind these tools; they run on the server on the shopper's cart, and a change
 * updates the count and shows a toast before the tool returns. The cart page, when it is open, loads fresh right
 * after the result is returned.
 */
@customElement('cart-count')
export class CartCount extends RadiantElement {
	@state
	@bindTo<number>([
		{ ref: 'value', text: true },
		{ bool: 'hidden', map: (count) => count === 0 },
	])
	protected count = 0;

	/** Whether a cart change arrived, which makes a slower initial load stale. */
	private changed = false;

	protected override onConnected(): void {
		void this.load();
	}

	@onEvent({ window: true, type: CART_CHANGE_EVENT })
	onCartChange(event: CustomEvent<CartTotals>) {
		this.changed = true;
		this.count = event.detail.totalQuantity;
	}

	/**
	 * @remarks
	 * A failed request leaves the count hidden: the cart link still works.
	 */
	private async load(): Promise<void> {
		this.changed = false;
		const response = await fetch(storePaths.cartApi, { headers: { Accept: 'application/json' } }).catch(() => null);
		if (!response?.ok) return;
		const totals = (await response.json().catch(() => null)) as CartTotals | null;
		if (totals && !this.changed) this.count = totals.totalQuantity;
	}

	@agentTool(agentToolConfig(getCartInfo))
	getCart(input: ToolInputOf<typeof getCartInfo>, { signal }: AgentToolExecuteOptions) {
		return callAgentTool(getCartInfo.name, input, signal);
	}

	@agentTool(agentToolConfig(updateCartInfo))
	updateCart(input: ToolInputOf<typeof updateCartInfo>, { signal }: AgentToolExecuteOptions) {
		return callAgentTool(updateCartInfo.name, input, signal, { onCartChange: announceAssistantCartChange });
	}

	@agentTool(agentToolConfig(cancelCartInfo))
	cancelCart(input: ToolInputOf<typeof cancelCartInfo>, { signal }: AgentToolExecuteOptions) {
		return callAgentTool(cancelCartInfo.name, input, signal, { onCartChange: announceAssistantCartChange });
	}

	@agentTool(agentToolConfig(proceedToCheckoutInfo))
	proceedToCheckout(input: ToolInputOf<typeof proceedToCheckoutInfo>, { signal }: AgentToolExecuteOptions) {
		return callAgentTool(proceedToCheckoutInfo.name, input, signal);
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'cart-count': JsxCustomElementAttributes<CartCount, {}>;
	}
}
