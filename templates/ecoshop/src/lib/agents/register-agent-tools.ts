import { type AgentToolHost, createAgentTool } from '@ecopages/radiant/helpers/create-agent-tool';
import type { CartTotals } from '../cart/cart-events';
import { callAgentTool, loadAgentToolDescriptors } from './agent-tool-client';
import type { StoreToolDescriptor } from './agent-tool-types';

export interface RegisterAgentToolsOptions {
	/** Rewrites a tool's description, such as to name the product of the page. */
	describe?(description: string): string;
	/** Runs after a call changed the shopper's cart, before the result is returned. */
	onCartChange(totals: CartTotals): void;
}

/**
 * Registers the page tools of one `scope` with WebMCP, each following the host's connect and disconnect through
 * `createAgentTool`.
 *
 * @remarks
 * Call it only where `document.modelContext` exists, since it downloads the tool list. If the list cannot be loaded
 * no tool is registered: the persisted `<store-agent-tools>` tries again only after a full load, and a new product
 * page retries its own tools.
 */
export async function registerAgentTools(
	host: AgentToolHost,
	scope: StoreToolDescriptor['scope'],
	{ describe, onCartChange }: RegisterAgentToolsOptions,
): Promise<void> {
	const descriptors = await loadAgentToolDescriptors().catch(() => []);
	for (const { scope: toolScope, ...descriptor } of descriptors) {
		if (toolScope !== scope) continue;
		createAgentTool(host, {
			...descriptor,
			description: describe ? describe(descriptor.description) : descriptor.description,
			execute: (input, { signal }) => callAgentTool(descriptor.name, input, signal, { onCartChange }),
		});
	}
}
