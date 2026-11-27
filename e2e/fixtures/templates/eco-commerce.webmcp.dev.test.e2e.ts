import type { Page } from '@playwright/test';
import { expect, test } from '../../app-fixture.ts';

const SUBCATEGORY = '/collections/living/seating/lounge-chairs';

/**
 * A stand-in for the browser's `document.modelContext`, after the WebMCP draft: `registerTool(tool, { signal })`
 * resolves, a duplicate name rejects with `InvalidStateError`, and aborting the signal removes the tool.
 */
function installFakeModelContext(): void {
	type Tool = { name: string; execute: (input: unknown, options: { signal: AbortSignal }) => Promise<unknown> };
	const tools = new Map<string, Tool>();
	const modelContext = {
		registerTool(tool: Tool, options: { signal: AbortSignal }) {
			if (tools.has(tool.name)) return Promise.reject(new DOMException(tool.name, 'InvalidStateError'));
			tools.set(tool.name, tool);
			options.signal.addEventListener('abort', () => {
				if (tools.get(tool.name) === tool) tools.delete(tool.name);
			});
			return Promise.resolve(undefined);
		},
	};
	Object.defineProperty(document, 'modelContext', { value: modelContext, configurable: true });
	Object.assign(window, {
		__agent: {
			names: () => [...tools.keys()].sort(),
			call: async (name: string, input: unknown) => {
				const tool = tools.get(name);
				if (!tool) throw new Error(`No tool ${name}`);
				return JSON.parse(JSON.stringify(await tool.execute(input, { signal: new AbortController().signal })));
			},
		},
	});
}

type Agent = { names(): string[]; call(name: string, input: unknown): Promise<unknown> };

function toolNames(page: Page): Promise<string[]> {
	return page.evaluate(() => (window as unknown as { __agent: Agent }).__agent.names());
}

function callTool(page: Page, name: string, input: unknown): Promise<Record<string, unknown>> {
	return page.evaluate(([tool, args]) => (window as unknown as { __agent: Agent }).__agent.call(tool, args), [
		name,
		input,
	] as const) as Promise<Record<string, unknown>>;
}

const SITE_TOOLS = ['browse_store', 'get_cart', 'get_product', 'open_product', 'search_catalog'];

async function openProduct(page: Page): Promise<void> {
	await page.goto(SUBCATEGORY);
	await page.locator('.product-card').first().click();
	await expect(page.locator('add-to-cart')).toBeVisible();
}

test.describe('WebMCP tools', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(installFakeModelContext);
	});

	test('every catalog page registers the site tools', async ({ page }) => {
		await page.goto(SUBCATEGORY);

		await expect.poll(() => toolNames(page)).toEqual(expect.arrayContaining([...SITE_TOOLS, 'filter_products']));
	});

	test('browse_store without input lists the place the visitor is on', async ({ page }) => {
		await page.goto('/collections/living/seating');
		await expect.poll(() => toolNames(page)).toContain('browse_store');

		const result = await callTool(page, 'browse_store', {});

		expect(result).toMatchObject({ level: 'category', category: { handle: 'seating' } });
	});

	test('an agent adds two to the cart from a product page, after a call with an invalid quantity changed nothing', async ({
		page,
	}) => {
		await openProduct(page);
		await expect
			.poll(() => toolNames(page))
			.toEqual(expect.arrayContaining(['add_to_cart', 'select_variant', 'open_cart']));
		await page.evaluate(() => {
			(window as Window & { __loadMarker?: boolean }).__loadMarker = true;
		});

		expect(await callTool(page, 'add_to_cart', { quantity: 500 })).toEqual({
			error: 'quantity: expected an integer from 1 to 99',
		});
		expect((await (await page.request.get('/api/cart')).json()).itemCount).toBe(0);

		const result = await callTool(page, 'add_to_cart', { quantity: 2 });

		expect(result).toMatchObject({ itemCount: 2 });
		await expect(page.locator('cart-link [data-ref="count"]')).toHaveText('2');
		expect(await page.evaluate(() => (window as Window & { __loadMarker?: boolean }).__loadMarker)).toBe(true);
		const cart = await (await page.request.get('/api/cart')).json();
		expect(cart.lines).toEqual([expect.objectContaining({ quantity: 2 })]);
	});

	test('an agent picks a finish and the cart line carries it', async ({ page }) => {
		await openProduct(page);
		await expect.poll(() => toolNames(page)).toContain('select_variant');
		const finish = ((await page.locator('add-to-cart .rui-radio').nth(2).textContent()) ?? '').trim();

		expect(await callTool(page, 'select_variant', { variant: finish })).toMatchObject({ title: finish });
		await expect(page.locator('add-to-cart input[name="variantId"]').nth(2)).toBeChecked();
		await callTool(page, 'add_to_cart', {});

		const cart = await (await page.request.get('/api/cart')).json();
		expect(cart.lines).toEqual([expect.objectContaining({ variantTitle: finish })]);
	});

	test('page tools follow client navigation from a product page to the order page', async ({ page }) => {
		await openProduct(page);
		await expect.poll(() => toolNames(page)).toContain('add_to_cart');
		expect(await callTool(page, 'add_to_cart', {})).toMatchObject({ itemCount: 1 });

		await page.evaluate(() =>
			(
				window as unknown as { __ecopages_browser_router__: { navigate(href: string): Promise<void> } }
			).__ecopages_browser_router__.navigate('/order'),
		);
		await expect(page.getByRole('heading', { level: 1, name: 'Your order' })).toBeVisible();

		await expect
			.poll(() => toolNames(page))
			.toEqual(expect.arrayContaining(['remove_cart_line', 'update_cart_line']));
		expect(await toolNames(page)).not.toContain('add_to_cart');
	});

	test('on the order page an agent changes a line quantity and then removes the line', async ({ page }) => {
		const [first] = (await (await page.request.get('/api/products?in=lounge-chairs&pageSize=1')).json()).items;
		const { variants } = await (await page.request.get(`/api/products/${first.handle}`)).json();
		await page.request.post('/cart/add', { form: { variantId: variants[0].id, quantity: '1' } });
		await page.goto('/order');
		await expect.poll(() => toolNames(page)).toContain('update_cart_line');

		const updated = await callTool(page, 'update_cart_line', { variantId: variants[0].id, quantity: 3 });

		expect(updated).toMatchObject({ itemCount: 3 });
		await expect(page.getByRole('spinbutton', { name: `Quantity of ${first.title}` })).toHaveValue('3');

		expect(await callTool(page, 'remove_cart_line', { variantId: variants[0].id })).toMatchObject({ itemCount: 0 });
		await expect(page.getByRole('main').getByText('Your cart is empty.')).toBeVisible();
	});

	test('filter_products changes the listing and returns its first page', async ({ page }) => {
		await page.goto(SUBCATEGORY);
		await expect.poll(() => toolNames(page)).toContain('filter_products');

		const result = await callTool(page, 'filter_products', { sort: 'price-desc' });

		await expect(page).toHaveURL(/\/search\?in=lounge-chairs&sort=price-desc$/);
		expect(result).toMatchObject({ url: '/search?in=lounge-chairs&sort=price-desc' });
	});

	test('open_cart shows the cart drawer', async ({ page }) => {
		await page.goto('/');
		await expect.poll(() => toolNames(page)).toContain('open_cart');

		await callTool(page, 'open_cart', {});

		await expect(page.getByRole('dialog', { name: 'Your cart' })).toBeVisible();
	});
});

test('without document.modelContext no tool is registered and no error is logged', async ({ page }) => {
	const problems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error') problems.push(message.text());
	});
	page.on('pageerror', (error) => problems.push(error.message));

	await openProduct(page);
	await expect(page.locator('add-to-cart[data-enhanced]')).toBeAttached();
	await page.waitForFunction(() => customElements.get('store-agent-tools') !== undefined);

	expect(await page.evaluate(() => 'modelContext' in document)).toBe(false);
	expect(problems).toEqual([]);
});
