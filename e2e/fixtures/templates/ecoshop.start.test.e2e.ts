import { createHmac } from 'node:crypto';
import { get as httpGet } from 'node:http';
import { expect, type Page } from '@playwright/test';
import { test } from '../../app-fixture.ts';

/**
 * The ecoshop wiring under `ecopages start`: the Explicit Routes and Endpoints a built store serves, without a
 * browser. The webhook secret matches `appOptions.env` in `playwright.config.ts`.
 */
const WEBHOOK_SECRET = 'whsec-ecoshop-e2e';
const fieldShirtM = 'gid://ecoshop/ProductVariant/field-shirt-m';
const canvasTote = 'gid://ecoshop/ProductVariant/canvas-tote';
const fieldShirtHandle = 'field-shirt';

/** Marks the schema library: its chunk names its classes, and no other file of the store does. */
const SCHEMA_LIBRARY_MARKER = 'ZodMiniObject';

async function schemaChunksDownloaded(page: Page, path: string, withModelContext: boolean): Promise<string[]> {
	if (withModelContext) {
		await page.addInitScript(() => {
			const names = new Set<string>();
			Object.defineProperty(document, 'modelContext', {
				value: {
					registerTool(tool: { name: string }, options: { signal: AbortSignal }) {
						names.add(tool.name);
						options.signal.addEventListener('abort', () => names.delete(tool.name));
						return Promise.resolve(undefined);
					},
				},
				configurable: true,
			});
			Object.assign(window, { __toolNames: names });
		});
	}
	const reads: Promise<string | null>[] = [];
	page.on('response', (response) => {
		if (!response.url().endsWith('.js')) return;
		reads.push(response.text().then((text) => (text.includes(SCHEMA_LIBRARY_MARKER) ? response.url() : null)));
	});
	await page.goto(path);
	await page.waitForFunction(() =>
		['cart-form', 'cart-count', 'store-agent-tools'].every((tag) => customElements.get(tag)),
	);
	await page.waitForLoadState('networkidle');
	if (withModelContext) {
		await page.waitForFunction(() => (window as unknown as { __toolNames: Set<string> }).__toolNames.size > 0);
	}
	return (await Promise.all(reads)).filter((url): url is string => url !== null);
}

test('a visitor without WebMCP downloads no schema library', async ({ page }) => {
	expect(await schemaChunksDownloaded(page, '/products/field-shirt', false)).toEqual([]);
});

test('a browser with WebMCP downloads the schema library to register the tools', async ({ page }) => {
	expect(await schemaChunksDownloaded(page, '/products/field-shirt', true)).toHaveLength(1);
});

/** The status of a GET for `/` that names `host` as its `Host`, sent to the running server's port. */
function statusForHost(appUrl: string, host: string): Promise<number> {
	return new Promise((resolve, reject) => {
		httpGet(
			{ host: 'localhost', port: Number(new URL(appUrl).port), path: '/', headers: { Host: host } },
			(res) => {
				res.resume();
				resolve(res.statusCode ?? 0);
			},
		).on('error', reject);
	});
}

test('the production server refuses a request for a host it does not serve', async ({ app }) => {
	expect(await statusForHost(app.url, 'evil.example')).toBe(400);
	expect(await statusForHost(app.url, `evil.example:${new URL(app.url).port}`)).toBe(400);
	expect(await statusForHost(app.url, `localhost:${new URL(app.url).port}`)).toBe(200);
});

test('the production server answers only the host of its baseUrl: no IP address, no loopback name', async ({ app }) => {
	const { port } = new URL(app.url);

	expect(await statusForHost(app.url, `127.0.0.1:${port}`)).toBe(400);
	expect(await statusForHost(app.url, `[::1]:${port}`)).toBe(400);
	expect(await statusForHost(app.url, `app.localhost:${port}`)).toBe(400);
	expect(await statusForHost(app.url, `localhost.:${port}`)).toBe(200);
});

/** What a browser sends with a form post or `fetch` from a page of the store itself. */
const fromThisSite = { 'Sec-Fetch-Site': 'same-origin' };

const mcpHeaders = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };

test('llms.txt lists the store, its collections and the MCP endpoint', async ({ request }) => {
	const response = await request.get('/llms.txt');

	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toContain('text/plain');
	const text = await response.text();
	expect(text).toMatch(/^# Ecoshop/u);
	expect(text).toMatch(/\[Apparel\]\(.+\/collections\/apparel\)/u);
	expect(text).toMatch(/\[MCP server\]\(.+\/mcp\)/u);
	expect(text).toMatch(/\]\(.+\/products\/[a-z0-9-]+\.md\)/u);
});

test('a product answers as Markdown at <handle>.md and as a page at <handle>', async ({ request }) => {
	const markdown = await request.get(`/products/${fieldShirtHandle}.md`);
	expect(markdown.status()).toBe(200);
	expect(markdown.headers()['content-type']).toContain('text/markdown');
	expect(await markdown.text()).toContain('Field Shirt');

	const page = await request.get(`/products/${fieldShirtHandle}`);
	expect(page.status()).toBe(200);
	expect(page.headers()['content-type']).toContain('text/html');
});

test('the cart answers a form post with a redirect, and an invalid one with a redirect to a notice', async ({
	request,
}) => {
	const form = await request.post('/api/cart', {
		form: { intent: 'add', variantId: fieldShirtM, quantity: '2' },
		headers: fromThisSite,
		maxRedirects: 0,
	});
	expect(form.status()).toBe(303);
	expect(form.headers().location).toBe('/cart');
	expect(form.headers()['set-cookie']).toMatch(/^ecoshop_cart=.+HttpOnly/u);

	const second = await request.post('/api/cart', {
		form: { intent: 'add', variantId: fieldShirtM, quantity: '1' },
		headers: fromThisSite,
		maxRedirects: 0,
	});
	expect(second.status()).toBe(303);

	const invalid = await request.post('/api/cart', {
		form: { intent: 'add' },
		headers: fromThisSite,
		maxRedirects: 0,
	});
	expect(invalid.status()).toBe(303);
	expect(invalid.headers().location).toBe('/cart?notice=invalid');

	const totals = await request.get('/api/cart');
	expect(await totals.json()).toEqual({ totalQuantity: 3, subtotal: '$204.00' });

	const page = await request.get('/cart');
	expect(await page.text()).toContain('$204.00');

	const repeated = await request.post('/api/cart', {
		data: `intent=add&variantId=${encodeURIComponent(canvasTote)}&variantId=${encodeURIComponent(fieldShirtM)}`,
		headers: { ...fromThisSite, 'Content-Type': 'application/x-www-form-urlencoded' },
		maxRedirects: 0,
	});
	expect(repeated.status()).toBe(303);
	expect(repeated.headers().location).toBe('/cart?notice=invalid');
	expect(await (await request.get('/api/cart')).json()).toEqual({ totalQuantity: 3, subtotal: '$204.00' });
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

test('the demo catalog has no UCP profile or endpoint, and says to use /mcp', async ({ request }) => {
	const profile = await request.get('/.well-known/ucp');
	const endpoint = await request.post('/api/ucp/mcp', { data: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });

	expect(profile.status()).toBe(404);
	expect(endpoint.status()).toBe(404);
	expect(((await endpoint.json()) as { error: string }).error).toMatch(/\/mcp/u);
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

const stateChangingRoutes = [
	{ path: '/api/cart', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, data: 'intent=add' },
	{ path: '/api/agent-tools/get_cart', headers: { 'Content-Type': 'application/json' }, data: '{}' },
	{ path: '/mcp', headers: mcpHeaders, data: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' },
	{ path: '/api/ucp/mcp', headers: { 'Content-Type': 'application/json' }, data: '{}' },
	{ path: '/api/revalidate', headers: { 'Content-Type': 'application/json' }, data: '{}' },
];

for (const route of stateChangingRoutes) {
	test(`${route.path} refuses a request from another site`, async ({ request }) => {
		const crossSite = await request.post(route.path, {
			headers: { ...route.headers, 'Sec-Fetch-Site': 'cross-site' },
			data: route.data,
			maxRedirects: 0,
		});
		const foreignOrigin = await request.post(route.path, {
			headers: { ...route.headers, Origin: 'https://evil.example' },
			data: route.data,
			maxRedirects: 0,
		});

		expect(crossSite.status()).toBe(403);
		expect(foreignOrigin.status()).toBe(403);
	});
}

test('the cart and the page tools refuse a post with neither Sec-Fetch-Site nor Origin, and the agent routes do not', async ({
	request,
}) => {
	const cart = await request.post('/api/cart', { form: { intent: 'add', variantId: fieldShirtM }, maxRedirects: 0 });
	const tool = await request.post('/api/agent-tools/get_cart', { data: {} });
	const mcp = await request.post('/mcp', {
		headers: mcpHeaders,
		data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
	});

	const ucp = await request.post('/api/ucp/mcp', { data: {} });

	expect(cart.status()).toBe(403);
	expect(tool.status()).toBe(403);
	expect(mcp.status()).toBe(200);
	expect(ucp.status()).toBe(404);
});

test('a post whose Origin is the origin the visitor used passes, with no Sec-Fetch-Site', async ({ app, request }) => {
	const cart = await request.post('/api/cart', {
		form: { intent: 'add', variantId: fieldShirtM },
		headers: { Origin: app.url },
		maxRedirects: 0,
	});

	expect(cart.status()).toBe(303);
});

test('a refused post answers in the shape of its route', async ({ request }) => {
	const mcp = await request.post('/mcp', {
		headers: { ...mcpHeaders, 'Sec-Fetch-Site': 'cross-site' },
		data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
	});
	const cart = await request.post('/api/cart', {
		form: { intent: 'add', variantId: fieldShirtM },
		headers: { 'Sec-Fetch-Site': 'cross-site' },
		maxRedirects: 0,
	});

	expect(mcp.status()).toBe(403);
	expect(await mcp.json()).toMatchObject({ jsonrpc: '2.0', error: { code: -32000 } });
	expect(cart.status()).toBe(403);
	expect(await cart.json()).toEqual({ error: 'Cross-origin request refused' });
});
