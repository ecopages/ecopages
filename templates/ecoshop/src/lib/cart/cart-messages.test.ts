import { describe, expect, it } from 'vitest';
import type { Cart } from '@/lib/commerce/types';
import { describeLine, describeShortage, shortageNotice, shortageQuery } from './cart-messages';

const tote = 'gid://ecoshop/ProductVariant/canvas-tote';
const money = { amount: '36.00', currencyCode: 'USD' };

function cartWith(quantity: number, variantTitle = 'Default Title'): Cart {
	return {
		id: 'cart',
		checkoutUrl: '/checkout',
		totalQuantity: quantity,
		subtotal: money,
		lines: [
			{
				id: 'line',
				quantity,
				variantId: tote,
				variantTitle,
				productHandle: 'canvas-tote',
				productTitle: 'Canvas Tote',
				unitPrice: money,
				totalPrice: money,
				image: null,
			},
		],
	};
}

describe('cart messages', () => {
	it('names a line by its product, and its variant unless it is the only one', () => {
		expect(describeLine({ productTitle: 'Canvas Tote', variantTitle: 'Default Title' })).toBe('Canvas Tote');
		expect(describeLine({ productTitle: 'Field Shirt', variantTitle: 'M' })).toBe('Field Shirt (M)');
	});

	it('says how many are in stock and how many were asked for', () => {
		expect(describeShortage('Canvas Tote', 2, 5)).toBe(
			'Canvas Tote: only 2 in stock, so the cart holds 2 instead of 5.',
		);
	});

	it('words the cart page notice from the cart, for a line that is short', () => {
		const query = Object.fromEntries(new URLSearchParams(shortageQuery(tote, 5)));

		expect(shortageNotice(cartWith(3), query)).toBe(describeShortage('Canvas Tote', 3, 5));
		expect(shortageNotice(cartWith(5), query)).toBeNull();
		expect(shortageNotice(null, query)).toBeNull();
	});

	it('says nothing for a link that names no short line or carries nonsense', () => {
		expect(shortageNotice(cartWith(3), { notice: 'refused', line: tote, wanted: '5' })).toBeNull();
		expect(shortageNotice(cartWith(3), { notice: 'short', line: 'gid://other', wanted: '5' })).toBeNull();
		expect(shortageNotice(cartWith(3), { notice: 'short', line: tote, wanted: '5.5' })).toBeNull();
		expect(shortageNotice(cartWith(3), { notice: 'short', line: tote, wanted: '500' })).toBeNull();
		expect(shortageNotice(cartWith(3), { notice: 'short', line: tote })).toBeNull();
	});
});
