import '@ecopages/radiant-ui/number-field';
import { RadiantElement, customElement } from '@ecopages/radiant';
import { agentTool } from '@ecopages/radiant/decorators/agent-tool';
import type { AgentToolExecuteOptions } from '@ecopages/radiant/helpers/register-agent-tool';
import { reloadCurrentPage } from '@/lib/browser/navigation';
import { dispatchCartChange } from '@/lib/storefront/cart-events';
import type { CartJson } from '@/lib/storefront/json';
import { isStoreError, postCartChange, type StoreError } from '@/lib/browser/store-api';
import { readToolInput } from '@/lib/webmcp/catalog-tools';
import { removeCartLineTool, updateCartLineTool } from '@/lib/webmcp/definitions';

/**
 * `<order-lines>`: the order page's lines, and the agent tools that change them.
 *
 * @remarks
 * Each line is a plain form posting to `/cart/update`, which works without JavaScript. The tools post the same
 * change, then render the page again from the server, so they return once the page shows the new cart.
 */
@customElement('order-lines')
export class OrderLinesElement extends RadiantElement {
	async setQuantity(variantId: string, quantity: number, signal?: AbortSignal): Promise<CartJson | StoreError> {
		const result = await postCartChange('/cart/update', { variantId, quantity }, { fetch, signal });
		if (isStoreError(result)) return result;
		dispatchCartChange({ cart: result });
		await reloadCurrentPage();
		return result;
	}

	@agentTool(updateCartLineTool)
	updateCartLineTool(input: unknown, { signal }: AgentToolExecuteOptions) {
		const values = readToolInput(updateCartLineTool, input);
		return isStoreError(values) ? values : this.setQuantity(values.variantId, values.quantity, signal);
	}

	@agentTool(removeCartLineTool)
	removeCartLineTool(input: unknown, { signal }: AgentToolExecuteOptions) {
		const values = readToolInput(removeCartLineTool, input);
		return isStoreError(values) ? values : this.setQuantity(values.variantId, 0, signal);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'order-lines': OrderLinesElement;
	}
}
