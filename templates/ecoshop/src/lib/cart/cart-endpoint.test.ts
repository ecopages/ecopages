import { describe, expect, it } from 'vitest';
import { createDemoProvider } from '@/lib/commerce/demo/demo-provider';
import type { CommerceProvider } from '@/lib/commerce/types';
import { CART_COOKIE, readCartId } from './cart-cookie';
import {
	cartActionSchema,
	handleCartGet,
	handleCartPost as applyCartAction,
	redirectInvalidPost,
	refuseCrossOrigin,
} from './cart-endpoint.server';

const provider = createDemoProvider();

/**
 * Runs what the Endpoint runs: Ecopages parses the form body and validates it against `schema.body`, then calls the
 * handler with the result. The parse here stands in for the framework's.
 */
async function handleCartPost(request: Request, target: CommerceProvider): Promise<Response> {
	const fields = Object.fromEntries(await request.clone().formData());
	return applyCartAction(request, target, cartActionSchema.parse(fields));
}

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

	it('redirects back with a notice when the provider refuses the change', async () => {
		const refused = await handleCartPost(formPost({ intent: 'add', variantId: soldOut }), provider);

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

describe('cart endpoint input and totals', () => {
	it('takes the last variant when the product form posts a hidden one and a checked radio', () => {
		const parsed = cartActionSchema.parse({ intent: 'add', variantId: [fieldShirtM, canvasTote], quantity: '1' });

		expect(parsed.variantId).toBe(canvasTote);
	});

	it('sends a post that fails the schema back to the cart with the invalid notice', () => {
		const response = redirectInvalidPost();

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/cart?notice=invalid');
	});

	it('has the schema name each invalid field', () => {
		const tooMany = cartActionSchema.safeParse({ intent: 'add', variantId: fieldShirtM, quantity: '500' });
		const noVariant = cartActionSchema.safeParse({ intent: 'add' });

		expect(tooMany.error?.issues.map((issue) => issue.path)).toEqual([['quantity']]);
		expect(noVariant.error?.issues.map((issue) => issue.path)).toEqual([['variantId']]);
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
	it('lets a form posted from the store itself, or by a client with no Origin, go on', () => {
		expect(refuseCrossOrigin(formPost({}, { Origin: 'https://shop.test' }))).toBeNull();
		expect(refuseCrossOrigin(formPost({}))).toBeNull();
	});

	it('refuses a form posted from another site, before its body is read', async () => {
		const request = formPost({ intent: 'add', variantId: fieldShirtM }, { Origin: 'https://evil.test' });

		const response = refuseCrossOrigin(request);

		expect(response?.status).toBe(403);
		expect(request.bodyUsed).toBe(false);
	});
});
