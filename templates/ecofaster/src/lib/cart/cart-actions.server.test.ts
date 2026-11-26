import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { openTestCatalog } from '../db/catalog-database.fixture.ts';
import { addToCartAction, cartSummaryAction, updateCartAction, type CartActionDeps } from './cart-actions.server.ts';
import { CART_COOKIE, encodeCart, readCart } from './cart-cookie.server.ts';
import { addToCart, EMPTY_CART, MAX_LINES, MAX_QUANTITY, type CartSummary } from './cart.ts';
import { getOrder } from './order.server.ts';

const secret = 'test-secret-that-is-at-least-32-characters';
const origin = 'http://localhost:3000';

function post(
	pathname: string,
	fields: Record<string, string>,
	init: { accept?: string; cookie?: string; origin?: string; fetchSite?: string } = {},
) {
	const headers = new Headers({ 'content-type': 'application/x-www-form-urlencoded' });
	if (init.accept) headers.set('accept', init.accept);
	if (init.cookie) headers.set('cookie', init.cookie);
	if (init.origin) headers.set('origin', init.origin);
	if (init.fetchSite) headers.set('sec-fetch-site', init.fetchSite);
	return new Request(`${origin}${pathname}`, { method: 'POST', headers, body: new URLSearchParams(fields) });
}

/** The request a browser sends next, carrying the cookie the response set. */
function followCookie(response: Response, pathname = '/order'): Request {
	const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
	return new Request(`${origin}${pathname}`, { headers: { cookie } });
}

describe('cart actions', () => {
	let database: Awaited<ReturnType<typeof openTestCatalog>>;
	const deps = (): CartActionDeps => ({ db: database.db, secret, secureCookie: false });

	beforeAll(async () => {
		database = await openTestCatalog();
	});

	afterAll(() => database.dispose());

	test('a plain form post adds the product and redirects to the order page, which lists it once', async () => {
		const response = await addToCartAction(post('/cart/add', { productId: '1' }), deps());

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/order');

		const order = await getOrder(database.db, readCart(followCookie(response), secret));
		expect(order.lines).toHaveLength(1);
		expect(order.lines[0]?.product.id).toBe(1);
		expect(order.lines[0]?.quantity).toBe(1);
	});

	test('a request that asks for JSON gets the new count instead of a redirect', async () => {
		const cookie = `${CART_COOKIE}=${encodeCart(addToCart(EMPTY_CART, 1, 2), secret)}`;

		const response = await addToCartAction(
			post('/cart/add', { productId: '2', quantity: '1' }, { accept: 'application/json', cookie }),
			deps(),
		);

		expect(response.status).toBe(200);
		expect(((await response.json()) as CartSummary).count).toBe(3);
		expect(response.headers.get('set-cookie')).toContain(`${CART_COOKIE}=`);
	});

	test('rejects a product that does not exist without touching the cart', async () => {
		const response = await addToCartAction(post('/cart/add', { productId: '999999' }), deps());

		expect(response.status).toBe(400);
		expect(response.headers.get('set-cookie')).toBeNull();
	});

	test('rejects a post a browser sent from another site', async () => {
		const response = await addToCartAction(
			post('/cart/add', { productId: '1' }, { fetchSite: 'cross-site' }),
			deps(),
		);

		expect(response.status).toBe(403);
		expect(response.headers.get('set-cookie')).toBeNull();
	});

	test('accepts a same-origin post whose Origin differs from the address the server listens on', async () => {
		const response = await addToCartAction(
			post('/cart/add', { productId: '1' }, { fetchSite: 'same-origin', origin: 'https://shop.example' }),
			deps(),
		);

		expect(response.status).toBe(303);
	});

	test('marks the cookie Secure when the site is served over HTTPS', async () => {
		const response = await addToCartAction(post('/cart/add', { productId: '1' }), {
			...deps(),
			secureCookie: true,
		});

		expect(response.headers.get('set-cookie')).toContain('Secure');
	});

	test.each([
		['a product id that is not a number', { productId: 'abc' }],
		['a negative quantity', { productId: '1', quantity: '-1' }],
		['a zero quantity', { productId: '1', quantity: '0' }],
		['a fractional quantity', { productId: '1', quantity: '1.5' }],
		['a quantity that is not a number', { productId: '1', quantity: 'abc' }],
	])('rejects %s without touching the cart', async (_, fields) => {
		const response = await addToCartAction(post('/cart/add', fields), deps());

		expect(response.status).toBe(400);
		expect(response.headers.get('set-cookie')).toBeNull();
	});

	test('refuses to add a new product to a full cart, with the reason, instead of reporting it added', async () => {
		let full = EMPTY_CART;
		for (let id = 1; id <= MAX_LINES; id += 1) full = addToCart(full, id, 1);
		const cookie = `${CART_COOKIE}=${encodeCart(full, secret)}`;

		const response = await addToCartAction(
			post('/cart/add', { productId: String(MAX_LINES + 1) }, { accept: 'application/json', cookie }),
			deps(),
		);

		expect(response.status).toBe(409);
		expect(((await response.json()) as { error: string }).error).toMatch(/full/u);
		expect(response.headers.get('set-cookie')).toBeNull();
	});

	test('refuses to add a unit to a line already at the maximum quantity', async () => {
		const cookie = `${CART_COOKIE}=${encodeCart(addToCart(EMPTY_CART, 1, MAX_QUANTITY), secret)}`;

		const response = await addToCartAction(post('/cart/add', { productId: '1' }, { cookie }), deps());

		expect(response.status).toBe(409);
	});

	test('rejects a body that is not a form', async () => {
		const request = new Request(`${origin}/cart/add`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{"productId":1}',
		});

		const response = await addToCartAction(request, deps());

		expect(response.status).toBe(400);
	});

	test('updating a quantity to zero removes the line', async () => {
		const cookie = `${CART_COOKIE}=${encodeCart(addToCart(addToCart(EMPTY_CART, 1, 1), 2, 1), secret)}`;

		const response = await updateCartAction(
			post('/cart/update', { productId: '1', quantity: '0' }, { cookie }),
			deps(),
		);

		expect(response.status).toBe(303);
		expect(readCart(followCookie(response), secret).lines).toEqual([{ productId: 2, quantity: 1 }]);
	});

	test('removes a line whose product the catalog no longer has', async () => {
		const cookie = `${CART_COOKIE}=${encodeCart(addToCart(addToCart(EMPTY_CART, 1, 1), 999_999, 1), secret)}`;

		const response = await updateCartAction(
			post('/cart/update', { productId: '999999', quantity: '0' }, { cookie }),
			deps(),
		);

		expect(response.status).toBe(303);
		expect(readCart(followCookie(response), secret).lines).toEqual([{ productId: 1, quantity: 1 }]);
	});

	test('a tampered cart cookie reads as an empty order', async () => {
		const [payload] = encodeCart(addToCart(EMPTY_CART, 1, 1), secret).split('.');
		const request = new Request(`${origin}/order`, { headers: { cookie: `${CART_COOKIE}=${payload}.forged` } });

		const order = await getOrder(database.db, readCart(request, secret));

		expect(order).toEqual({ lines: [], count: 0, totalCents: 0 });
	});

	test('the summary counts the units the order page lists', async () => {
		const cart = addToCart(addToCart(addToCart(EMPTY_CART, 1, 2), 2, 1), 999_999, 4);
		const cookie = `${CART_COOKIE}=${encodeCart(cart, secret)}`;

		const response = await cartSummaryAction(new Request(`${origin}/api/cart`, { headers: { cookie } }), deps());

		expect(((await response.json()) as CartSummary).count).toBe(3);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});

	test('the summary lists each line with its product, link and prices', async () => {
		const cookie = `${CART_COOKIE}=${encodeCart(addToCart(EMPTY_CART, 1, 2), secret)}`;

		const response = await cartSummaryAction(new Request(`${origin}/api/cart`, { headers: { cookie } }), deps());
		const summary = (await response.json()) as CartSummary;

		expect(summary.lines).toHaveLength(1);
		expect(summary.lines[0]).toMatchObject({ productId: 1, quantity: 2 });
		expect(summary.lines[0]?.url).toBe(`/products/${summary.lines[0]?.product}`);
		expect(summary.lines[0]?.subtotal).toMatch(/^\$\d/u);
		expect(summary.total).toBe(summary.lines[0]?.subtotal);
	});

	test('the order skips products that no longer exist and totals the rest', async () => {
		const order = await getOrder(database.db, addToCart(addToCart(EMPTY_CART, 1, 2), 999_999, 1));

		expect(order.lines.map((line) => line.product.id)).toEqual([1]);
		expect(order.count).toBe(2);
		expect(order.totalCents).toBe(order.lines[0]!.product.priceCents * 2);
	});
});
