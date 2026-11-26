import type { CartTotals } from '@/lib/cart/cart-events';

/**
 * A tool result in the MCP `CallToolResult` shape that Shopify's storefront tools also return.
 */
export interface StoreToolResult {
	content: Array<{ type: 'text'; text: string }>;
	structuredContent: Record<string, unknown>;
	isError?: true;
}

/**
 * The part of a tool an agent sees: what `/mcp` lists and what a page registers with `document.modelContext`.
 */
export interface StoreToolDescriptor {
	name: string;
	title: string;
	description: string;
	inputSchema: Record<string, unknown>;
	annotations: { readOnlyHint?: boolean; consequentialHint?: boolean; untrustedContentHint?: boolean };
	/** Which host registers it: the layout's `<store-agent-tools>` on every page (`store`), or the product page's `<cart-form>` (`product`). */
	scope: 'store' | 'product';
}

/**
 * What `/api/agent-tools/<name>` answers a page: the tool result for the agent, the cart totals for the header
 * count when the cart changed, and a page to open after the result is returned.
 */
export interface AgentToolResponse {
	result: StoreToolResult;
	cart?: CartTotals;
	navigateTo?: string;
}
