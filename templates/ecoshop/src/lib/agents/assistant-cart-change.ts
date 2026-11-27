import { toast } from '@ecopages/radiant-ui/toast';
import type { CartTotals } from '../cart/cart-events';
import { describeCartTotals } from './agent-tool-client';

/**
 * Tells the shopper that their assistant changed the cart, with the new totals.
 *
 * @remarks
 * The hosts that run a cart-changing tool for an agent pass it as `onCartChange` of `callAgentTool`, so the shopper
 * sees the change they did not make. A change the shopper makes with the add button has its own toast.
 */
export function announceAssistantCartChange(totals: CartTotals): void {
	toast.success('Your assistant updated the cart', { description: describeCartTotals(totals) });
}
