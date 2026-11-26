import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { CommerceBackend } from '../commerce/backend.ts';
import {
	addToCartAction,
	CART_COOKIE,
	cartSummaryAction,
	readCartToken,
	serializeCartCookie,
	updateCartAction,
	type CartHttpDeps,
} from './cart-http.server.ts';
import type { CartJson } from './json.ts';
import { firstVariant, openTestBackend } from './test-backend.fixture.ts';

const origin = 'http://localhost:3000';

function post(
	pathname: string,
	fields: Record<string, string>,
	init: { accept?: string; cookie?: string; fetchSite?: string } = {},
) {
	const headers = new Headers({ 'content-type': 'application/x-www-form-urlencoded' });
	if (init.accept) headers.set('accept', init.accept);
	if (init.cookie) headers.set('cookie', init.cookie);
	if (init.fetchSite) headers.set('sec-fetch-site', init.fetchSite);
	return new Request(`${origin}${pathname}`, { method: 'POST', headers, body: new URLSearchParams(fields) });
}

/** The cookie header a browser sends next, carrying what the response set. */
function nextCookie(response: Response): string {
	return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

describe('cart HTTP', () => {
	let subject: Awaited<ReturnType<typeof openTestBackend>>;
	let backend: CommerceBackend;
	let variantId = '';
	const deps = (): CartHttpDeps => ({ cart: backend.cart, secureCookie: false });

	beforeAll(async () => {
		subject = await openTestBackend();
		backend = subject.backend;
		variantId = (await firstVariant(backend)).variantId;
	});

	afterAll(() => subject.dispose());

	test('a plain form post adds the variant and redirects to the order page, which holds it once', async () => {
		const response = await addToCartAction(post('/cart/add', { variantId }), deps());

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/order');
		const cart = await backend.cart.getCart(
			readCartToken(new Request(origin, { headers: { cookie: nextCookie(response) } })),
		);
		expect(cart.lines).toEqual([expect.objectContaining({ variantId, quantity: 1 })]);
	});

	test('a request that asks for JSON gets the cart instead of a redirect', async () => {
		const response = await addToCartAction(
			post('/cart/add', { variantId, quantity: '2' }, { accept: 'application/json' }),
			deps(),
		);

		expect(response.status).toBe(200);
		expect(((await response.json()) as CartJson).itemCount).toBe(2);
		expect(response.headers.get('set-cookie')).toContain(`${CART_COOKIE}=`);
	});

	test.each([
		['an unknown variant', { variantId: '999999:oak' }, 400],
		['a missing variant', { quantity: '1' }, 400],
		['a negative quantity', { variantId, quantity: '-1' }, 400],
		['a fractional quantity', { variantId, quantity: '1.5' }, 400],
		['a zero quantity', { variantId, quantity: '0' }, 400],
	])('refuses %s without setting a cookie', async (_, fields, status) => {
		const response = await addToCartAction(post('/cart/add', fields as Record<string, string>), deps());

		expect(response.status).toBe(status);
		expect(response.headers.get('set-cookie')).toBeNull();
	});

	test('refuses a post a browser sent from another site', async () => {
		const response = await addToCartAction(post('/cart/add', { variantId }, { fetchSite: 'cross-site' }), deps());

		expect(response.status).toBe(403);
	});

	test('refuses an addition past the cart limit with the reason', async () => {
		const full = await backend.cart.updateItem(null, { variantId, quantity: 99 });
		const cookie = full.ok ? `${CART_COOKIE}=${full.token}` : '';

		const response = await addToCartAction(
			post('/cart/add', { variantId }, { accept: 'application/json', cookie }),
			deps(),
		);

		expect(response.status).toBe(409);
		expect(((await response.json()) as { error: string }).error).toMatch(/full/u);
	});

	test('updating a quantity to zero removes the line', async () => {
		const added = await backend.cart.addItem(null, { variantId, quantity: 1 });
		const cookie = added.ok ? `${CART_COOKIE}=${added.token}` : '';

		const response = await updateCartAction(post('/cart/update', { variantId, quantity: '0' }, { cookie }), deps());

		expect(response.status).toBe(303);
		const cart = await backend.cart.getCart(
			readCartToken(new Request(origin, { headers: { cookie: nextCookie(response) } })),
		);
		expect(cart.lines).toEqual([]);
	});

	test('a tampered cart cookie reads as an empty cart', async () => {
		const added = await backend.cart.addItem(null, { variantId, quantity: 1 });
		const [payload] = added.ok ? added.token.split('.') : [''];
		const request = new Request(`${origin}/api/cart`, { headers: { cookie: `${CART_COOKIE}=${payload}.forged` } });

		const summary = (await (await cartSummaryAction(request, deps())).json()) as CartJson;

		expect(summary).toEqual({ itemCount: 0, lines: [], subtotal: '$0.00' });
	});

	test('the summary lists each line with its product, option, link and prices', async () => {
		const added = await backend.cart.addItem(null, { variantId, quantity: 2 });
		const cookie = added.ok ? `${CART_COOKIE}=${added.token}` : '';

		const response = await cartSummaryAction(new Request(`${origin}/api/cart`, { headers: { cookie } }), deps());
		const summary = (await response.json()) as CartJson;

		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(summary.lines[0]).toMatchObject({ variantId, quantity: 2 });
		expect(summary.lines[0]?.url).toBe(`/products/${summary.lines[0]?.handle}`);
		expect(summary.lines[0]?.variantTitle.length).toBeGreaterThan(0);
		expect(summary.subtotal).toBe(summary.lines[0]?.subtotal);
	});

	test('writes an HttpOnly, SameSite=Lax cookie for the whole site, Secure when asked', () => {
		const header = serializeCartCookie('abc.def', { secure: false });

		expect(header).toBe(`${CART_COOKIE}=abc.def; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`);
		expect(serializeCartCookie('abc.def', { secure: true })).toContain('; Secure');
	});
});
