import { toast } from '@ecopages/radiant-ui/toast';
import type { CartTotals } from '../cart/cart-events';
import { describeCartTotals } from './agent-tool-client';
import type { CartViewMessage, StoreToolResult } from './agent-tool-types';

/**
 * What a cart tool result says went differently from the change: the `messages` of its cart view that are warnings
 * or errors, such as a quantity the store capped at its stock.
 */
export function cartProblems(result: StoreToolResult): string[] {
	const messages = result.structuredContent.messages as CartViewMessage[] | undefined;
	return (messages ?? []).filter((message) => message.type !== 'info').map((message) => message.content);
}

/**
 * Tells the shopper that the cart changed, with the new totals, and as a warning when the change went differently
 * from what was asked.
 */
export function announceCartChange(title: string, totals: CartTotals, result: StoreToolResult): void {
	const problems = cartProblems(result);
	const description = [describeCartTotals(totals), ...problems].join(' ');
	if (problems.length) toast.warning(title, { description });
	else toast.success(title, { description });
}

/**
 * Tells the shopper that their assistant changed the cart.
 *
 * @remarks
 * The hosts that run a cart-changing tool for an agent pass it as `onCartChange` of `callAgentTool`, so the shopper
 * sees the change they did not make. A change the shopper makes with the add button has its own title.
 */
export function announceAssistantCartChange(totals: CartTotals, result: StoreToolResult): void {
	announceCartChange('Your assistant updated the cart', totals, result);
}
