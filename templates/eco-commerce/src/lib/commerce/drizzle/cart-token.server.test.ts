import { describe, expect, test } from 'vitest';
import { resolveCartSecret } from './cart-secret.server.ts';
import { decodeCartToken, encodeCartToken, newCartId } from './cart-token.server.ts';

const secret = 'test-secret-that-is-at-least-32-characters';

describe('cart token', () => {
	test('decodes the cart id it encoded', () => {
		const cartId = newCartId();

		expect(decodeCartToken(encodeCartToken(cartId, secret), secret)).toBe(cartId);
	});

	test('reads no cart when the id was changed or the secret differs', () => {
		const [, signature] = encodeCartToken(newCartId(), secret).split('.');

		expect(decodeCartToken(`${newCartId()}.${signature}`, secret)).toBeNull();
		expect(
			decodeCartToken(encodeCartToken(newCartId(), 'another-secret-that-is-32-characters-x'), secret),
		).toBeNull();
	});

	test('reads no cart from malformed or missing tokens', () => {
		for (const token of [null, '', 'abc', 'a.b.c', '.', 'not-a-uuid.signature']) {
			expect(decodeCartToken(token, secret)).toBeNull();
		}
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
