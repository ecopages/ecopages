import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { CommerceBackend } from '../commerce/backend.ts';
import type { CartUpdate } from '../commerce/types.ts';
import {
	addToCartAction,
	addToCartSchema,
	CART_COOKIE,
	cartSummaryAction,
	readCartToken,
	refuseCrossSite,
	refuseInvalidChange,
	serializeCartCookie,
	updateCartAction,
	updateCartSchema,
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

/** The token a setup change returned; a refused change fails the test instead of leaving an empty cart. */
function tokenOf(update: CartUpdate): string {
	if (!update.ok || !update.token) throw new Error(update.ok ? 'The change started no cart.' : update.message);
	return update.token;
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
	type PostInit = Parameters<typeof post>[2];
	/** Runs the Endpoint's steps: the body is validated by its schema first, as Ecopages does before the handler. */
	const add = (fields: Record<string, string>, init?: PostInit) =>
		addToCartAction(post('/cart/add', fields, init), addToCartSchema.parse(fields), deps());
	const update = (fields: Record<string, string>, init?: PostInit) =>
		updateCartAction(post('/cart/update', fields, init), updateCartSchema.parse(fields), deps());

	beforeAll(async () => {
		subject = await openTestBackend();
		backend = subject.backend;
		variantId = (await firstVariant(backend)).variantId;
	});

	afterAll(() => subject.dispose());

	test('a plain form post adds the variant and redirects to the order page, which holds it once', async () => {
		const response = await add({ variantId });

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/order');
		const cart = await backend.cart.getCart(
			readCartToken(new Request(origin, { headers: { cookie: nextCookie(response) } })),
		);
		expect(cart.lines).toEqual([expect.objectContaining({ variantId, quantity: 1 })]);
	});

	test('a request that asks for JSON gets the cart instead of a redirect', async () => {
		const response = await add({ variantId, quantity: '2' }, { accept: 'application/json' });

		expect(response.status).toBe(200);
		expect(((await response.json()) as CartJson).itemCount).toBe(2);
		expect(response.headers.get('set-cookie')).toContain(`${CART_COOKIE}=`);
	});

	test('refuses an unknown variant and an added quantity of zero without setting a cookie', async () => {
		const refused: Record<string, string>[] = [{ variantId: '999999:oak' }, { variantId, quantity: '0' }];
		for (const fields of refused) {
			const response = await add(fields);

			expect(response.status).toBe(400);
			expect(response.headers.get('set-cookie')).toBeNull();
		}
	});

	test('has the schema reject a missing variant and a quantity that is not a whole number', () => {
		const invalid: Record<string, string>[] = [
			{ quantity: '1' },
			{ variantId: '', quantity: '1' },
			{ variantId, quantity: '-1' },
			{ variantId, quantity: '1.5' },
			{ variantId, quantity: 'many' },
		];
		for (const fields of invalid) {
			expect(addToCartSchema.safeParse(fields).success).toBe(false);
			expect(updateCartSchema.safeParse(fields).success).toBe(false);
		}
	});

	test('takes the default quantity of the Endpoint for a missing or empty field', () => {
		expect(addToCartSchema.parse({ variantId })).toEqual({ variantId, quantity: 1 });
		expect(addToCartSchema.parse({ variantId, quantity: '' })).toEqual({ variantId, quantity: 1 });
		expect(updateCartSchema.parse({ variantId })).toEqual({ variantId, quantity: 0 });
	});

	test('answers a change that fails the schema with the reason, as JSON or as text', async () => {
		const asJson = refuseInvalidChange(post('/cart/add', {}, { accept: 'application/json' }));
		const asText = refuseInvalidChange(post('/cart/add', {}));

		expect(asJson.status).toBe(400);
		expect(await asJson.json()).toEqual({ error: expect.stringMatching(/option or quantity/u) });
		expect(asText.status).toBe(400);
		expect(await asText.text()).toMatch(/option or quantity/u);
		expect(asText.headers.get('content-type')).toContain('text/plain');
	});

	test('refuses a post a browser sent from another site, and lets the others go on', () => {
		expect(refuseCrossSite(post('/cart/add', { variantId }, { fetchSite: 'cross-site' }))?.status).toBe(403);
		for (const fetchSite of ['same-origin', 'none', undefined]) {
			expect(refuseCrossSite(post('/cart/add', { variantId }, { fetchSite }))).toBeNull();
		}
	});

	test('refuses an addition past the cart limit with the reason', async () => {
		const full = await backend.cart.updateItem(null, { variantId, quantity: 99 });
		const cookie = `${CART_COOKIE}=${tokenOf(full)}`;

		const response = await add({ variantId }, { accept: 'application/json', cookie });

		expect(response.status).toBe(409);
		expect(((await response.json()) as { error: string }).error).toMatch(/full/u);
	});

	test('removing a line without a cart sets no cookie', async () => {
		const response = await update({ variantId, quantity: '0' });

		expect(response.status).toBe(303);
		expect(response.headers.get('set-cookie')).toBeNull();
	});

	test('updating a quantity to zero removes the line', async () => {
		const added = await backend.cart.addItem(null, { variantId, quantity: 1 });
		const cookie = `${CART_COOKIE}=${tokenOf(added)}`;

		const response = await update({ variantId, quantity: '0' }, { cookie });

		expect(response.status).toBe(303);
		const cart = await backend.cart.getCart(
			readCartToken(new Request(origin, { headers: { cookie: nextCookie(response) } })),
		);
		expect(cart.lines).toEqual([]);
	});

	test('a tampered cart cookie reads as an empty cart', async () => {
		const added = await backend.cart.addItem(null, { variantId, quantity: 1 });
		const [payload] = tokenOf(added).split('.');
		const request = new Request(`${origin}/api/cart`, { headers: { cookie: `${CART_COOKIE}=${payload}.forged` } });

		const summary = (await (await cartSummaryAction(request, deps())).json()) as CartJson;

		expect(summary).toEqual({ itemCount: 0, lines: [], subtotal: '$0.00' });
	});

	test('the summary lists each line with its product, option, link and prices', async () => {
		const added = await backend.cart.addItem(null, { variantId, quantity: 2 });
		const cookie = `${CART_COOKIE}=${tokenOf(added)}`;

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
