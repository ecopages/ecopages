import { describe, expect, test } from 'vitest';
import { addToCart, cartCount, EMPTY_CART, MAX_LINES, MAX_QUANTITY, setQuantity } from './cart.ts';

describe('cart', () => {
	test('adding a product to an empty cart creates a line with that quantity', () => {
		expect(addToCart(EMPTY_CART, 7, 1)).toEqual({ lines: [{ productId: 7, quantity: 1 }] });
	});

	test('adding a product already in the cart increases its quantity', () => {
		const cart = addToCart(addToCart(EMPTY_CART, 7, 1), 7, 2);

		expect(cart.lines).toEqual([{ productId: 7, quantity: 3 }]);
	});

	test('caps a line at the maximum quantity', () => {
		expect(addToCart(EMPTY_CART, 7, MAX_QUANTITY + 5).lines[0]?.quantity).toBe(MAX_QUANTITY);
	});

	test('ignores a new product once the cart holds the maximum number of lines', () => {
		let cart = EMPTY_CART;
		for (let id = 1; id <= MAX_LINES; id += 1) cart = addToCart(cart, id, 1);

		expect(addToCart(cart, MAX_LINES + 1, 1)).toBe(cart);
	});

	test('setting a quantity of zero removes the line', () => {
		const cart = setQuantity(addToCart(EMPTY_CART, 7, 2), 7, 0);

		expect(cart.lines).toEqual([]);
	});

	test('setting a quantity replaces it', () => {
		expect(setQuantity(addToCart(EMPTY_CART, 7, 2), 7, 5).lines).toEqual([{ productId: 7, quantity: 5 }]);
	});

	test('counts every unit across lines', () => {
		const cart = addToCart(addToCart(EMPTY_CART, 7, 2), 8, 3);

		expect(cartCount(cart)).toBe(5);
	});
});
