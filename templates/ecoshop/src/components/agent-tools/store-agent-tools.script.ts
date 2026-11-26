import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import { RadiantElement, customElement } from '@ecopages/radiant';
import { createAgentTool } from '@ecopages/radiant/helpers/create-agent-tool';
import { toast } from '@ecopages/radiant-ui/toast';
import { callAgentTool, hasModelContext, loadAgentToolDescriptors } from '../../lib/agents/agent-tool-client';

/**
 * Tools a page component owns instead of this host: `add_to_cart` belongs to the product form.
 */
const PAGE_OWNED_TOOLS = new Set(['add_to_cart']);

/**
 * Registers the storefront's WebMCP tools (the Shopify storefront set: catalog, cart, checkout and store questions)
 * while it is on the page.
 *
 * @remarks
 * It sits in the layout with `data-eco-persist`, so the browser router keeps it, and its tools, across client
 * navigations. Each tool follows this host's connect and disconnect through `createAgentTool`. Where the browser has
 * no `document.modelContext` it does nothing: no request, no registration, no log. Tools run on the server through
 * `/api/agent-tools`, which validates the input, so the browser holds no schema library.
 */
@customElement('store-agent-tools')
export class StoreAgentTools extends RadiantElement {
	private started = false;

	protected override onConnected(): void {
		if (this.started || !hasModelContext()) return;
		this.started = true;
		void this.registerTools();
	}

	private async registerTools(): Promise<void> {
		const descriptors = await loadAgentToolDescriptors().catch(() => []);
		for (const descriptor of descriptors) {
			if (PAGE_OWNED_TOOLS.has(descriptor.name)) continue;
			createAgentTool(this, {
				...descriptor,
				execute: (input, { signal }) =>
					callAgentTool(descriptor.name, input, signal, {
						onCartChange: (totals) =>
							toast.success('Your assistant updated the cart', {
								description: `${totals.totalQuantity} item(s)${totals.subtotal ? `, ${totals.subtotal}` : ''}`,
							}),
					}),
			});
		}
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'store-agent-tools': JsxCustomElementAttributes<StoreAgentTools, {}>;
	}
}
