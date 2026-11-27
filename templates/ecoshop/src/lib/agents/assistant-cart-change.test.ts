import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreToolResult } from './agent-tool-types';

const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn() }));
vi.mock('@ecopages/radiant-ui/toast', () => ({ toast }));

const { announceAssistantCartChange, announceCartChange, cartProblems } = await import('./assistant-cart-change');

const totals = { totalQuantity: 3, subtotal: '$204.00' };

function resultWith(messages?: unknown): StoreToolResult {
	return {
		content: [{ type: 'text', text: 'The cart holds 3 items.' }],
		structuredContent: messages === undefined ? {} : { messages },
	};
}

beforeEach(() => {
	toast.success.mockClear();
	toast.warning.mockClear();
});

describe('cartProblems', () => {
	it('lists the warnings and errors of a cart view, and skips what is only information', () => {
		const result = resultWith([
			{ type: 'warning', code: 'quantity_reduced', content: 'Only 3 in stock.' },
			{ type: 'error', code: 'change_incomplete', content: 'The rest was refused.' },
			{ type: 'info', content: 'Free shipping.' },
		]);

		expect(cartProblems(result)).toEqual(['Only 3 in stock.', 'The rest was refused.']);
		expect(cartProblems(resultWith())).toEqual([]);
	});
});

describe('announceCartChange', () => {
	it('shows a success toast with the totals when the change went as asked', () => {
		announceCartChange('Added to your cart', totals, resultWith());

		expect(toast.success).toHaveBeenCalledWith('Added to your cart', {
			description: '3 item(s) in your cart, $204.00',
		});
		expect(toast.warning).not.toHaveBeenCalled();
	});

	it('shows a warning toast with the totals and every problem when it went differently', () => {
		announceCartChange(
			'Added to your cart',
			totals,
			resultWith([
				{ type: 'warning', code: 'quantity_reduced', content: 'Only 3 in stock.' },
				{ type: 'error', code: 'change_incomplete', content: 'The rest was refused.' },
			]),
		);

		expect(toast.warning).toHaveBeenCalledWith('Added to your cart', {
			description: '3 item(s) in your cart, $204.00 Only 3 in stock. The rest was refused.',
		});
		expect(toast.success).not.toHaveBeenCalled();
	});

	it('says an assistant made the change', () => {
		announceAssistantCartChange(totals, resultWith());

		expect(toast.success).toHaveBeenCalledWith('Your assistant updated the cart', expect.anything());
	});
});
