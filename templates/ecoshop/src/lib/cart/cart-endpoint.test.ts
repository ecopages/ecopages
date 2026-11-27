import { describe, expect, it } from 'vitest';
import { createDemoProvider } from '@/lib/commerce/demo/demo-provider';
import type { CommerceProvider } from '@/lib/commerce/types';
import { CART_COOKIE, readCartId } from './cart-cookie';
import { handleCartGet, handleCartPost } from './cart-endpoint.server';

const provider = createDemoProvider();
const fieldShirtM = 'gid://ecoshop/ProductVariant/field-shirt-m';
const canvasTote = 'gid://ecoshop/ProductVariant/canvas-tote';
const soldOut = 'gid://ecoshop/ProductVariant/linen-overshirt-l';

function formPost(
	fields: Record<string, string>,
	headers: Record<string, string> = {},
	url = 'https://shop.test/api/cart',
): Request {
	return new Request(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
		body: new URLSearchParams(fields),
	});
}

/**
 * What the `cart-form` host sends: a `FormData` body, so `multipart/form-data`.
 */
function hostPost(fields: Record<string, string>, headers: Record<string, string> = {}): Request {
	const body = new FormData();
	for (const [name, value] of Object.entries(fields)) body.append(name, value);
	return new Request('https://shop.test/api/cart', {
		method: 'POST',
		headers: { Accept: 'application/json', ...headers },
		body,
	});
}

function cookieFrom(response: Response): string {
	const header = response.headers.get('set-cookie') ?? '';
	return header.split(';')[0] ?? '';
}

async function cartFrom(response: Response) {
	return provider.getCart(readCartId(new Headers({ cookie: cookieFrom(response) })) ?? '');
}

describe('cart endpoint without JavaScript', () => {
	it('adds the posted variant, stores the cart in a cookie and redirects to the cart', async () => {
		const response = await handleCartPost(
			formPost({ intent: 'add', variantId: fieldShirtM, quantity: '2' }),
			provider,
		);

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/cart');
		const setCookie = response.headers.get('set-cookie') ?? '';
		expect(setCookie).toMatch(new RegExp(`^${CART_COOKIE}=`, 'u'));
		expect(setCookie).toMatch(/HttpOnly/u);
		expect(setCookie).toMatch(/SameSite=Lax/u);
		expect(setCookie).toMatch(/Secure/u);
		expect((await cartFrom(response))?.lines[0]).toMatchObject({ variantId: fieldShirtM, quantity: 2 });
	});

	it('redirects to the cart with the shortage when the store held fewer than the form asked for', async () => {
		const response = await handleCartPost(
			formPost({ intent: 'add', variantId: canvasTote, quantity: '5' }),
			provider,
		);

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe(
			`/cart?notice=short&line=${encodeURIComponent(canvasTote)}&wanted=5`,
		);
	});

	it('leaves Secure off the cookie on plain http, so it works on localhost', async () => {
		const response = await handleCartPost(
			formPost({ intent: 'add', variantId: fieldShirtM }, {}, 'http://localhost:3000/api/cart'),
			provider,
		);

		expect(response.headers.get('set-cookie')).not.toMatch(/Secure/u);
	});

	it('changes the cart named by the cookie', async () => {
		const added = await handleCartPost(formPost({ intent: 'add', variantId: fieldShirtM }), provider);
		const cookie = cookieFrom(added);

		const second = await handleCartPost(formPost({ intent: 'add', variantId: canvasTote }, { cookie }), provider);
		expect((await cartFrom(second))?.lines.map((line) => line.variantId)).toEqual([fieldShirtM, canvasTote]);

		const removed = await handleCartPost(
			formPost({ intent: 'set', variantId: fieldShirtM, quantity: '0' }, { cookie: cookieFrom(second) }),
			provider,
		);
		expect((await cartFrom(removed))?.lines.map((line) => line.variantId)).toEqual([canvasTote]);
	});

	it('redirects back with a notice when the form is invalid or the provider refuses it', async () => {
		const invalid = await handleCartPost(formPost({ intent: 'add' }), provider);
		const refused = await handleCartPost(formPost({ intent: 'add', variantId: soldOut }), provider);

		expect(invalid.status).toBe(303);
		expect(invalid.headers.get('location')).toBe('/cart?notice=invalid');
		expect(refused.status).toBe(303);
		expect(refused.headers.get('location')).toBe('/cart?notice=refused');
	});

	it('lets a backend failure through instead of reporting it as a refused item', async () => {
		const failing: CommerceProvider = {
			...provider,
			addToCart: async () => {
				throw new Error('Storefront API answered 503');
			},
		};

		await expect(handleCartPost(formPost({ intent: 'add', variantId: fieldShirtM }), failing)).rejects.toThrow(
			'503',
		);
	});
});

describe('cart endpoint with JavaScript', () => {
	it('answers JSON with the cart totals to the `cart-form` host', async () => {
		const response = await handleCartPost(
			hostPost({ intent: 'add', variantId: fieldShirtM, quantity: '3' }),
			provider,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ totalQuantity: 3, subtotal: '$204.00' });
		expect(response.headers.get('set-cookie')).toMatch(new RegExp(`^${CART_COOKIE}=`, 'u'));
	});

	it('accepts a JSON body from other clients', async () => {
		const response = await handleCartPost(
			new Request('https://shop.test/api/cart', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({ intent: 'add', variantId: canvasTote, quantity: 2 }),
			}),
			provider,
		);

		expect(await response.json()).toEqual({ totalQuantity: 2, subtotal: '$72.00' });
	});

	it('answers 422 with the reason when the provider refuses the change', async () => {
		const response = await handleCartPost(hostPost({ intent: 'add', variantId: soldOut }), provider);

		expect(response.status).toBe(422);
		expect(await response.json()).toEqual({ error: expect.stringMatching(/sold out/u) });
	});

	it('answers 400 naming the invalid field', async () => {
		const response = await handleCartPost(
			hostPost({ intent: 'add', variantId: fieldShirtM, quantity: '500' }),
			provider,
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: expect.stringMatching(/quantity/u) });
	});

	it('reports the totals of the current cart', async () => {
		const added = await handleCartPost(formPost({ intent: 'add', variantId: fieldShirtM }), provider);

		const response = await handleCartGet(
			new Request('https://shop.test/api/cart', { headers: { cookie: cookieFrom(added) } }),
			provider,
		);

		expect(await response.json()).toEqual({ totalQuantity: 1, subtotal: '$68.00' });
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it('reports an empty cart when there is no cookie', async () => {
		const response = await handleCartGet(new Request('https://shop.test/api/cart'), provider);

		expect(await response.json()).toEqual({ totalQuantity: 0, subtotal: null });
	});
});

describe('cart endpoint origin check', () => {
	it('accepts a form posted from the store itself', async () => {
		const response = await handleCartPost(
			formPost({ intent: 'add', variantId: fieldShirtM }, { Origin: 'https://shop.test' }),
			provider,
		);

		expect(response.status).toBe(303);
	});

	it('refuses a form posted from another site', async () => {
		const response = await handleCartPost(
			formPost({ intent: 'add', variantId: fieldShirtM }, { Origin: 'https://evil.test' }),
			provider,
		);

		expect(response.status).toBe(403);
	});
});
