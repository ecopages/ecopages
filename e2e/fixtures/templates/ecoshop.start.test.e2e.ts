import { createHmac } from 'node:crypto';
import { expect } from '@playwright/test';
import { test } from '../../app-fixture.ts';

/**
 * The ecoshop wiring under `ecopages start`: the Explicit Routes and Endpoints a built store serves, without a
 * browser. The webhook secret matches `appOptions.env` in `playwright.config.ts`.
 */
const WEBHOOK_SECRET = 'whsec-ecoshop-e2e';
const fieldShirtM = 'gid://ecoshop/ProductVariant/field-shirt-m';

const mcpHeaders = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };

test('llms.txt lists the store, its collections and the MCP endpoint', async ({ request }) => {
	const response = await request.get('/llms.txt');

	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toContain('text/plain');
	const text = await response.text();
	expect(text).toMatch(/^# Ecoshop/u);
	expect(text).toMatch(/\[Apparel\]\(.+\/collections\/apparel\)/u);
	expect(text).toMatch(/\[MCP server\]\(.+\/mcp\)/u);
});

test('the cart answers a form post with a redirect and the cart-form host with JSON', async ({ request }) => {
	const form = await request.post('/api/cart', {
		form: { intent: 'add', variantId: fieldShirtM, quantity: '2' },
		maxRedirects: 0,
	});
	expect(form.status()).toBe(303);
	expect(form.headers().location).toBe('/cart');
	expect(form.headers()['set-cookie']).toMatch(/^ecoshop_cart=.+HttpOnly/u);

	const json = await request.post('/api/cart', {
		form: { intent: 'add', variantId: fieldShirtM, quantity: '1' },
		headers: { Accept: 'application/json' },
	});
	expect(await json.json()).toEqual({ totalQuantity: 3, subtotal: '$204.00' });

	const totals = await request.get('/api/cart');
	expect(await totals.json()).toEqual({ totalQuantity: 3, subtotal: '$204.00' });

	const page = await request.get('/cart');
	expect(await page.text()).toContain('$204.00');
});

test('the MCP server lists its tools and runs one', async ({ request }) => {
	const list = await request.post('/mcp', {
		headers: mcpHeaders,
		data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
	});
	expect(list.status()).toBe(200);
	const names = ((await list.json()) as { result: { tools: Array<{ name: string }> } }).result.tools.map(
		(tool) => tool.name,
	);
	expect(names).toEqual(expect.arrayContaining(['search_catalog', 'create_cart', 'proceed_to_checkout']));

	const call = await request.post('/mcp', {
		headers: mcpHeaders,
		data: {
			jsonrpc: '2.0',
			id: 2,
			method: 'tools/call',
			params: { name: 'search_catalog', arguments: { catalog: { query: 'shirt' } } },
		},
	});
	const result = ((await call.json()) as { result: { structuredContent: { products: Array<{ handle: string }> } } })
		.result;
	expect(result.structuredContent.products.map((product) => product.handle)).toContain('field-shirt');

	const get = await request.get('/mcp');
	expect(get.status()).toBe(405);
});

test('the revalidation webhook invalidates a tag for a valid signature and refuses another', async ({ request }) => {
	const body = JSON.stringify({ id: 1, handle: 'field-shirt' });
	const sign = (secret: string) => createHmac('sha256', secret).update(body, 'utf8').digest('base64');
	const headers = (secret: string) => ({
		'Content-Type': 'application/json',
		'X-Shopify-Topic': 'products/update',
		'X-Shopify-Hmac-Sha256': sign(secret),
	});

	await request.get('/products/field-shirt');
	await request.get('/products/linen-overshirt');
	expect((await request.get('/products/field-shirt')).headers()['x-cache']).toBe('HIT');
	expect((await request.get('/products/linen-overshirt')).headers()['x-cache']).toBe('HIT');

	const valid = await request.post('/api/revalidate', { headers: headers(WEBHOOK_SECRET), data: body });
	expect(valid.status()).toBe(200);
	expect(await valid.json()).toEqual({
		revalidated: true,
		tags: ['product-id:1', 'product:field-shirt', 'product-listings'],
	});

	expect((await request.get('/products/field-shirt')).headers()['x-cache']).toBe('MISS');
	expect((await request.get('/products/linen-overshirt')).headers()['x-cache']).toBe('HIT');

	const invalid = await request.post('/api/revalidate', { headers: headers('another-secret'), data: body });
	expect(invalid.status()).toBe(401);
});

test('a renamed product invalidates the page cached under its old handle by id', async ({ request }) => {
	const body = JSON.stringify({ id: 'linen-overshirt', handle: 'renamed-overshirt' });
	await request.get('/products/linen-overshirt');
	expect((await request.get('/products/linen-overshirt')).headers()['x-cache']).toBe('HIT');

	const response = await request.post('/api/revalidate', {
		headers: {
			'Content-Type': 'application/json',
			'X-Shopify-Topic': 'products/update',
			'X-Shopify-Hmac-Sha256': createHmac('sha256', WEBHOOK_SECRET).update(body, 'utf8').digest('base64'),
		},
		data: body,
	});

	expect((await response.json()).revalidated).toBe(true);
	expect((await request.get('/products/linen-overshirt')).headers()['x-cache']).toBe('MISS');
});

test('a shop update re-renders the policy pages', async ({ request }) => {
	const body = JSON.stringify({ id: 1, name: 'Ecoshop' });
	await request.get('/policies/shipping-policy');
	expect((await request.get('/policies/shipping-policy')).headers()['x-cache']).toBe('HIT');

	const response = await request.post('/api/revalidate', {
		headers: {
			'Content-Type': 'application/json',
			'X-Shopify-Topic': 'shop/update',
			'X-Shopify-Hmac-Sha256': createHmac('sha256', WEBHOOK_SECRET).update(body, 'utf8').digest('base64'),
		},
		data: body,
	});

	expect(await response.json()).toEqual({ revalidated: true, tags: ['collections', 'policies'] });
	expect((await request.get('/policies/shipping-policy')).headers()['x-cache']).toBe('MISS');
});
