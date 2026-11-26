import { describe, expect, test } from 'vitest';
import { addToCart, EMPTY_CART, MAX_LINES, MAX_QUANTITY } from './cart.ts';
import {
	CART_COOKIE,
	decodeCart,
	encodeCart,
	readCart,
	resolveCartSecret,
	serializeCartCookie,
} from './cart-cookie.server.ts';

const secret = 'test-secret-that-is-at-least-32-characters';
const cart = addToCart(addToCart(EMPTY_CART, 3, 1), 9, 2);

function requestWithCookie(cookie: string): Request {
	return new Request('http://localhost/order', { headers: { cookie } });
}

describe('cart cookie', () => {
	test('decodes what it encoded', () => {
		expect(decodeCart(encodeCart(cart, secret), secret)).toEqual(cart);
	});

	test('reads an empty cart when the payload was changed', () => {
		const [, signature] = encodeCart(cart, secret).split('.');
		const forged = Buffer.from(JSON.stringify([[3, 99]])).toString('base64url');

		expect(decodeCart(`${forged}.${signature}`, secret)).toEqual(EMPTY_CART);
	});

	test('reads an empty cart when the signature does not match the secret', () => {
		expect(decodeCart(encodeCart(cart, 'another-secret-that-is-32-characters-x'), secret)).toEqual(EMPTY_CART);
	});

	test('reads an empty cart from malformed values', () => {
		for (const value of ['', 'abc', 'a.b.c', '.', `${Buffer.from('{').toString('base64url')}.sig`]) {
			expect(decodeCart(value, secret)).toEqual(EMPTY_CART);
		}
	});

	test('reads an empty cart from a signed payload of the wrong shape', () => {
		const signedWrongShape = encodeCart({ lines: [{ productId: -1, quantity: 1.5 }] }, secret);

		expect(decodeCart(signedWrongShape, secret)).toEqual(EMPTY_CART);
	});

	test('reads the cart from the request cookie among others', () => {
		const request = requestWithCookie(`theme=dark; ${CART_COOKIE}=${encodeCart(cart, secret)}; other=1`);

		expect(readCart(request, secret)).toEqual(cart);
	});

	test('reads an empty cart when the request has no cart cookie', () => {
		expect(readCart(new Request('http://localhost/order'), secret)).toEqual(EMPTY_CART);
	});

	test('writes an HttpOnly, SameSite=Lax cookie for the whole site', () => {
		const header = serializeCartCookie(cart, secret, { secure: false });

		expect(header.startsWith(`${CART_COOKIE}=`)).toBe(true);
		expect(header).toContain('Path=/');
		expect(header).toContain('HttpOnly');
		expect(header).toContain('SameSite=Lax');
		expect(header).toMatch(/Max-Age=\d+/u);
		expect(header).not.toContain('Secure');
	});

	test('a full cart of the largest ids fits in the 4 KB cookie limit', () => {
		let full = EMPTY_CART;
		for (let line = 0; line < MAX_LINES; line += 1) full = addToCart(full, 24_000 - line, MAX_QUANTITY);

		expect(serializeCartCookie(full, secret, { secure: true }).length).toBeLessThan(4096);
	});

	test('marks the cookie Secure when asked', () => {
		expect(serializeCartCookie(cart, secret, { secure: true })).toContain('Secure');
	});
});

describe('resolveCartSecret', () => {
	test('uses CART_SECRET when set', () => {
		expect(resolveCartSecret({ CART_SECRET: secret, NODE_ENV: 'production' })).toBe(secret);
	});

	test('falls back to a development secret outside production', () => {
		expect(resolveCartSecret({ NODE_ENV: 'development' }).length).toBeGreaterThanOrEqual(32);
	});

	test('requires a secret of at least 32 characters in production', () => {
		expect(() => resolveCartSecret({ NODE_ENV: 'production' })).toThrow(/CART_SECRET/u);
		expect(() => resolveCartSecret({ NODE_ENV: 'production', CART_SECRET: 'short' })).toThrow(/32/u);
	});
});
