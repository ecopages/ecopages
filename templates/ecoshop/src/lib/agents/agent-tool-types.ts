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
 * What `/api/agent-tools/<name>` answers a page: the tool result for the agent, the cart totals for the header
 * count when the cart changed, and a page to open after the result is returned.
 */
export interface AgentToolResponse {
	result: StoreToolResult;
	cart?: CartTotals;
	navigateTo?: string;
}
