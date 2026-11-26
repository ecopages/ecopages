import { createHmac, timingSafeEqual } from 'node:crypto';
import { isProductionRuntime } from '@ecopages/core';
import { EMPTY_CART, MAX_LINES, MAX_QUANTITY, type Cart } from './cart.ts';

export const CART_COOKIE = 'ecofaster_cart';

/** Thirty days, in seconds. */
const CART_MAX_AGE = 60 * 60 * 24 * 30;

const MIN_SECRET_LENGTH = 32;

/**
 * Signs development carts when `CART_SECRET` is unset.
 *
 * @remarks
 * Public by design, so it never signs a production cart: {@link resolveCartSecret} refuses it there.
 */
const DEVELOPMENT_SECRET = 'ecofaster-development-cart-secret-not-for-production';

/**
 * Reads the secret that signs the cart cookie.
 *
 * @remarks
 * Called per request rather than at module load, because the build imports Endpoint modules without serving them.
 */
export function resolveCartSecret(env: NodeJS.ProcessEnv = process.env): string {
	const secret = env.CART_SECRET;
	const production = isProductionRuntime(env);
	if (secret) {
		if (production && secret.length < MIN_SECRET_LENGTH) {
			throw new Error(`CART_SECRET must be at least ${MIN_SECRET_LENGTH} characters long.`);
		}
		return secret;
	}
	if (production) {
		throw new Error('Set CART_SECRET to sign cart cookies in production. See .env.example.');
	}
	return DEVELOPMENT_SECRET;
}

function sign(payload: string, secret: string): string {
	return createHmac('sha256', secret).update(payload).digest('base64url');
}

function isCart(value: unknown): value is Array<[number, number]> {
	return (
		Array.isArray(value) &&
		value.length <= MAX_LINES &&
		value.every(
			(line) =>
				Array.isArray(line) &&
				line.length === 2 &&
				line.every(Number.isSafeInteger) &&
				line[0] > 0 &&
				line[1] > 0 &&
				line[1] <= MAX_QUANTITY,
		)
	);
}

/** Serializes a cart as `<payload>.<signature>`, both base64url. */
export function encodeCart(cart: Cart, secret: string): string {
	const payload = Buffer.from(JSON.stringify(cart.lines.map((line) => [line.productId, line.quantity]))).toString(
		'base64url',
	);
	return `${payload}.${sign(payload, secret)}`;
}

/**
 * Reads a cart cookie value, or the empty cart when it is malformed or its signature does not match.
 *
 * @remarks
 * A bad cookie is not an error: the visitor just sees an empty cart, and the next change writes a valid one.
 */
export function decodeCart(value: string, secret: string): Cart {
	const [payload, signature, ...rest] = value.split('.');
	if (!payload || !signature || rest.length > 0) return EMPTY_CART;

	const expected = Buffer.from(sign(payload, secret));
	const received = Buffer.from(signature);
	if (expected.length !== received.length || !timingSafeEqual(expected, received)) return EMPTY_CART;

	try {
		const lines: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
		if (!isCart(lines)) return EMPTY_CART;
		return { lines: lines.map(([productId, quantity]) => ({ productId, quantity })) };
	} catch {
		return EMPTY_CART;
	}
}

export function readCart(request: Request, secret: string): Cart {
	const header = request.headers.get('cookie');
	if (!header) return EMPTY_CART;
	for (const pair of header.split(';')) {
		const separator = pair.indexOf('=');
		if (separator === -1) continue;
		if (pair.slice(0, separator).trim() === CART_COOKIE) {
			return decodeCart(pair.slice(separator + 1).trim(), secret);
		}
	}
	return EMPTY_CART;
}

/** The `Set-Cookie` value that stores `cart`. */
export function serializeCartCookie(cart: Cart, secret: string, { secure }: { secure: boolean }): string {
	const attributes = [
		`${CART_COOKIE}=${encodeCart(cart, secret)}`,
		'Path=/',
		`Max-Age=${CART_MAX_AGE}`,
		'HttpOnly',
		'SameSite=Lax',
	];
	if (secure) attributes.push('Secure');
	return attributes.join('; ');
}
