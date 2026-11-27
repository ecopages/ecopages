import { expect, type Page } from '@playwright/test';
import { test } from '../../app-fixture.ts';

type ToolResult = { isError?: boolean; content: Array<{ text: string }>; structuredContent: Record<string, unknown> };

/**
 * A stand-in for the browser's WebMCP `document.modelContext`, injected before any page script runs. It behaves
 * like the spec: `registerTool` rejects a duplicate name, and a tool leaves the list only when the signal it was
 * registered with aborts.
 */
function installFakeModelContext(): void {
	type Tool = {
		name: string;
		description: string;
		inputSchema?: unknown;
		execute(input: unknown, options: { signal: AbortSignal }): Promise<unknown>;
	};
	const tools = new Map<string, Tool>();
	const modelContext = {
		registerTool(tool: Tool, options: { signal: AbortSignal }) {
			if (tools.has(tool.name)) {
				return Promise.reject(
					new DOMException(`A tool named "${tool.name}" is already registered.`, 'InvalidStateError'),
				);
			}
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
			definitions: () =>
				[...tools.values()].map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
			execute: (name: string, input: unknown) => {
				const tool = tools.get(name);
				if (!tool) throw new Error(`No tool ${name}`);
				return tool.execute(input, { signal: new AbortController().signal });
			},
		},
	});
}

const toolNames = (page: Page) =>
	page.evaluate(() => (window as unknown as { __agent: { names(): string[] } }).__agent.names());

const execute = (page: Page, name: string, input: unknown) =>
	page.evaluate(
		([toolName, toolInput]) =>
			(
				window as unknown as { __agent: { execute(name: string, input: unknown): Promise<unknown> } }
			).__agent.execute(toolName as string, toolInput),
		[name, input] as const,
	) as Promise<ToolResult>;

const fieldShirtM = 'gid://ecoshop/ProductVariant/field-shirt-m';
const fieldShirtL = 'gid://ecoshop/ProductVariant/field-shirt-l';

test.describe('ecoshop WebMCP tools', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(installFakeModelContext);
	});

	test('a product page registers the Shopify storefront tools and its own add_to_cart', async ({ page }) => {
		await page.goto('/products/field-shirt');

		await expect
			.poll(() => toolNames(page))
			.toEqual([
				'add_to_cart',
				'ask_business',
				'browse_store',
				'cancel_cart',
				'create_cart',
				'get_cart',
				'get_product',
				'proceed_to_checkout',
				'search_catalog',
				'show_variant',
				'update_cart',
			]);
	});

	test("an agent adds to the visitor's cart and the header count shows it before the tool returns", async ({
		page,
	}) => {
		await page.goto('/products/field-shirt');
		await expect.poll(() => toolNames(page)).toContain('add_to_cart');
		await page.evaluate(() => Object.assign(window, { __samePage: true }));

		const { result, headerCount } = await page.evaluate(async (variant) => {
			const agent = (
				window as unknown as { __agent: { execute(name: string, input: unknown): Promise<unknown> } }
			).__agent;
			const outcome = (await agent.execute('add_to_cart', { item: { id: variant }, quantity: 2 })) as ToolResult;
			return {
				result: outcome,
				headerCount: document.querySelector('cart-count [data-ref="value"]')?.textContent,
			};
		}, fieldShirtM);

		expect(result.isError).toBeFalsy();
		expect(result.structuredContent).toMatchObject({ item_count: 2 });
		expect(headerCount).toBe('2');
		expect(await page.evaluate(() => (window as unknown as { __samePage?: boolean }).__samePage)).toBe(true);

		const cart = await execute(page, 'get_cart', {});
		expect(cart.structuredContent).toMatchObject({
			line_items: [expect.objectContaining({ quantity: 2, item: expect.objectContaining({ id: fieldShirtM }) })],
		});
	});

	/**
	 * @remarks
	 * The first visit loads the product page in full: the dev server reloads open pages when a page first imports a
	 * package it has not bundled yet, which would otherwise break the client navigation under test.
	 */
	test('after an agent adds to the cart, the cart page a client navigation opens shows the line', async ({
		page,
	}) => {
		await page.goto('/products/field-shirt');
		await expect.poll(() => toolNames(page)).toContain('add_to_cart');
		await page.goto('/cart');
		await expect(page.locator('.cart-line')).toHaveCount(0);
		await page.evaluate(() => Object.assign(window, { __samePage: true }));
		await page.locator('a[href="/"]').first().click();
		await page.locator('.product-card__link[href="/products/field-shirt"]').click();
		await expect.poll(() => toolNames(page)).toContain('add_to_cart');

		await execute(page, 'add_to_cart', { item: { id: fieldShirtM }, quantity: 2 });
		await expect(page.getByText('Your assistant added this to your cart', { exact: true })).toBeVisible();

		await page.locator('.cart-link').click();
		await expect(page).toHaveURL(/\/cart$/u);
		await expect(page.locator('.cart-line')).toHaveCount(1);
		await expect(page.locator('.cart-line input[type="number"]')).toHaveValue('2');
		expect(await page.evaluate(() => (window as unknown as { __samePage?: boolean }).__samePage)).toBe(true);
	});

	test('a tool that opens a page goes through the router and keeps the tools registered', async ({ page }) => {
		await page.goto('/products/field-shirt');
		await expect.poll(() => toolNames(page)).toContain('add_to_cart');
		await page.evaluate(() => Object.assign(window, { __samePage: true }));

		const result = await execute(page, 'browse_store', { collection: 'apparel', navigate: true });

		expect(result.isError).toBeFalsy();
		await expect(page).toHaveURL(/\/collections\/apparel$/u);
		await expect.poll(() => toolNames(page)).not.toContain('add_to_cart');
		expect(await toolNames(page)).toContain('search_catalog');
		expect(await page.evaluate(() => (window as unknown as { __samePage?: boolean }).__samePage)).toBe(true);
	});

	test('an agent that empties the cart while the cart page is open refreshes it in place', async ({ page }) => {
		await page.goto('/products/field-shirt');
		await expect.poll(() => toolNames(page)).toContain('add_to_cart');
		await execute(page, 'add_to_cart', { item: { id: fieldShirtM }, quantity: 1 });
		await page.locator('.cart-link').click();
		await expect(page.locator('.cart-line')).toHaveCount(1);
		await page.evaluate(() => Object.assign(window, { __samePage: true }));
		const cart = await execute(page, 'get_cart', {});

		await execute(page, 'cancel_cart', { id: cart.structuredContent.id });

		await expect(page.locator('.cart-line')).toHaveCount(0);
		expect(await page.evaluate(() => (window as unknown as { __samePage?: boolean }).__samePage)).toBe(true);
	});

	test('page tools follow a client navigation from a product page to the cart', async ({ page }) => {
		await page.goto('/products/field-shirt');
		await expect.poll(() => toolNames(page)).toContain('add_to_cart');
		await page.evaluate(() => Object.assign(window, { __samePage: true }));

		await page.locator('.cart-link').click();
		await expect(page).toHaveURL(/\/cart$/u);

		await expect.poll(() => toolNames(page)).not.toContain('add_to_cart');
		expect(await toolNames(page)).toEqual(expect.arrayContaining(['get_cart', 'update_cart', 'cancel_cart']));
		expect(await page.evaluate(() => (window as unknown as { __samePage?: boolean }).__samePage)).toBe(true);
	});

	test('invalid input is refused in the browser, naming the field, and nothing is sent', async ({ page }) => {
		const calls: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('/api/agent-tools')) calls.push(request.url());
		});
		await page.goto('/products/field-shirt');
		await expect.poll(() => toolNames(page)).toContain('add_to_cart');

		const error = await page.evaluate(async (variant) => {
			const agent = (
				window as unknown as { __agent: { execute(name: string, input: unknown): Promise<unknown> } }
			).__agent;
			return agent.execute('add_to_cart', { item: { id: variant }, quantity: 0 }).then(
				() => null,
				(reason: unknown) => String(reason),
			);
		}, fieldShirtM);

		expect(error).toMatch(/quantity/u);
		expect(calls).toEqual([]);
		const cart = await execute(page, 'get_cart', {});
		expect(cart.structuredContent).toMatchObject({ item_count: 0 });
		await expect(page.locator('cart-count')).toBeHidden();
	});

	test('the catalog tools return results within the size Chrome recommends, so Radiant warns of nothing', async ({
		page,
	}) => {
		const warnings: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text());
		});
		await page.goto('/products/field-shirt');
		await expect.poll(() => toolNames(page)).toContain('add_to_cart');

		const results = [
			await execute(page, 'search_catalog', { catalog: { query: 'shirt' } }),
			await execute(page, 'get_product', {}),
			await execute(page, 'browse_store', { collection: 'all' }),
			await execute(page, 'ask_business', { ask: { query: 'What is your return policy?' } }),
		];

		for (const result of results) expect(JSON.stringify(result).length).toBeLessThanOrEqual(1500);
		expect(warnings).toEqual([]);
	});

	test('a shopper who adds more than the store holds is told how many went in, in the toast', async ({ page }) => {
		await page.goto('/products/canvas-tote');
		await page.locator('cart-form input[name="quantity"]').fill('5');

		await page.getByRole('button', { name: 'Add to cart' }).click();

		await expect(page.getByText('only 3 in stock, so the cart holds 3 instead of 5.')).toBeVisible();
		await expect(page.locator('cart-count [data-ref="value"]')).toHaveText('3');
	});

	test('an agent that asks for more than the store holds gets the line at the stock and a warning', async ({
		page,
	}) => {
		await page.goto('/products/canvas-tote');
		await expect.poll(() => toolNames(page)).toContain('add_to_cart');

		const result = await execute(page, 'add_to_cart', {
			item: { id: 'gid://ecoshop/ProductVariant/canvas-tote' },
			quantity: 5,
		});

		expect(result.structuredContent).toMatchObject({
			item_count: 3,
			messages: [
				{ type: 'warning', code: 'quantity_reduced', content: expect.stringContaining('only 3 in stock') },
			],
		});
		await expect(page.getByText('only 3 in stock, so the cart holds 3 instead of 5.')).toBeVisible();
	});

	test('the server checks the input again for a call that skips the browser', async ({ page }) => {
		await page.goto('/products/field-shirt');

		const response = await page.request.post('/api/agent-tools/add_to_cart?product=field-shirt', {
			data: { item: { id: fieldShirtM }, quantity: 0 },
			headers: { Origin: new URL(page.url()).origin },
		});

		const { result } = (await response.json()) as { result: ToolResult };
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toMatch(/quantity/u);
	});

	test('the add button and the agent run the same add: the same header count, each toast says who added', async ({
		page,
	}) => {
		await page.goto('/products/field-shirt');
		await expect.poll(() => toolNames(page)).toContain('add_to_cart');

		await page.getByRole('button', { name: 'Add to cart' }).click();
		await expect(page.getByText('Added to your cart', { exact: true })).toBeVisible();
		await expect(page.locator('cart-count [data-ref="value"]')).toHaveText('1');
		await expect(page.getByRole('button', { name: 'Add to cart' })).toBeEnabled();

		await execute(page, 'add_to_cart', { item: { id: fieldShirtM }, quantity: 2 });

		await expect(page.locator('cart-count [data-ref="value"]')).toHaveText('3');
		await expect(page.getByText('Your assistant added this to your cart', { exact: true })).toBeVisible();
	});

	test('the variant the shopper picked is the one the button adds', async ({ page }) => {
		await page.goto('/products/field-shirt');
		await expect.poll(() => toolNames(page)).toContain('add_to_cart');

		await page.getByText('L', { exact: true }).click();
		await page.getByRole('button', { name: 'Add to cart' }).click();
		await expect(page.locator('cart-count [data-ref="value"]')).toHaveText('1');

		const cart = await execute(page, 'get_cart', {});
		expect(cart.structuredContent).toMatchObject({
			line_items: [expect.objectContaining({ item: expect.objectContaining({ id: fieldShirtL }) })],
		});
	});

	test('a second addition while one is on its way is refused, and only the first is added', async ({ page }) => {
		await page.goto('/products/field-shirt');
		await expect.poll(() => toolNames(page)).toContain('add_to_cart');

		const results = await page.evaluate(async (variant) => {
			const agent = (
				window as unknown as { __agent: { execute(name: string, input: unknown): Promise<unknown> } }
			).__agent;
			return Promise.all([
				agent.execute('add_to_cart', { item: { id: variant }, quantity: 1 }),
				agent.execute('add_to_cart', { item: { id: variant }, quantity: 1 }),
			]) as Promise<ToolResult[]>;
		}, fieldShirtM);

		expect(results.filter((result) => result.isError)).toHaveLength(1);
		expect(results.find((result) => result.isError)?.content[0]?.text).toMatch(/still on its way/u);
		await expect(page.locator('cart-count [data-ref="value"]')).toHaveText('1');
	});

	test('an add the store refuses shows in the form and comes back as a tool error', async ({ page }) => {
		await page.goto('/products/field-shirt');
		await expect.poll(() => toolNames(page)).toContain('add_to_cart');

		const result = await execute(page, 'add_to_cart', {
			item: { id: 'gid://ecoshop/ProductVariant/canvas-tote' },
			quantity: 1,
		});

		expect(result.isError).toBe(true);
		await expect(page.locator('cart-form [data-ref="status"]')).toContainText(
			'not a variant of the product on this page',
		);
		await expect(page.locator('cart-count')).toBeHidden();
	});

	test('show_variant selects the variant in the picker on the same page before it returns', async ({ page }) => {
		await page.goto('/products/field-shirt');
		await expect.poll(() => toolNames(page)).toContain('show_variant');
		await page.evaluate(() => Object.assign(window, { __samePage: true }));

		const { result, checked } = await page.evaluate(async () => {
			const agent = (
				window as unknown as { __agent: { execute(name: string, input: unknown): Promise<unknown> } }
			).__agent;
			const outcome = (await agent.execute('show_variant', {
				catalog: { selected_options: [{ name: 'Size', value: 'L' }] },
			})) as ToolResult;
			const radio = document.querySelector<HTMLInputElement>('cart-form input[type="radio"]:checked');
			return { result: outcome, checked: radio?.value };
		});

		expect(result.isError).toBeFalsy();
		expect(checked).toBe('gid://ecoshop/ProductVariant/field-shirt-l');
		expect(new URL(page.url()).pathname).toBe('/products/field-shirt');
		expect(await page.evaluate(() => (window as unknown as { __samePage?: boolean }).__samePage)).toBe(true);
	});

	test('the page tools carry the names, descriptions and schemas /mcp lists, bundled and never fetched', async ({
		page,
	}) => {
		const downloads: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('/api/agent-tools') && request.method() === 'GET') downloads.push(request.url());
		});
		await page.goto('/products/field-shirt');
		await expect.poll(() => toolNames(page)).toContain('add_to_cart');
		const registered = await page.evaluate(() =>
			(
				window as unknown as {
					__agent: { definitions(): Array<{ name: string; description: string; inputSchema: unknown }> };
				}
			).__agent.definitions(),
		);

		const response = await page.request.post('/mcp', {
			headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
			data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
		});
		const { result } = (await response.json()) as {
			result: { tools: Array<{ name: string; description: string; inputSchema: { properties: object } }> };
		};

		expect(downloads).toEqual([]);
		for (const tool of result.tools) {
			const onPage = registered.find((entry) => entry.name === tool.name);
			expect(onPage, tool.name).toBeDefined();
			expect(onPage?.description).toBe(tool.description);
			const schema = onPage?.inputSchema as { properties: object } | undefined;
			expect(Object.keys(schema?.properties ?? {})).toEqual(Object.keys(tool.inputSchema.properties));
		}
	});
});

test('without WebMCP, no tool is registered and nothing is logged', async ({ page }) => {
	const messages: string[] = [];
	const toolRequests: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') messages.push(message.text());
	});
	page.on('pageerror', (error) => messages.push(String(error)));
	page.on('request', (request) => {
		if (request.url().includes('/api/agent-tools')) toolRequests.push(request.url());
	});

	await page.goto('/products/field-shirt');
	await page.waitForFunction(() =>
		Boolean(
			customElements.get('store-agent-tools') &&
			customElements.get('cart-form') &&
			customElements.get('cart-count'),
		),
	);

	expect(await page.evaluate(() => 'modelContext' in document)).toBe(false);
	expect(toolRequests).toEqual([]);
	expect(messages).toEqual([]);
});

test('a polyfill that installs document.modelContext after the page loaded gets the tools', async ({ page }) => {
	const messages: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') messages.push(message.text());
	});
	await page.goto('/products/field-shirt');
	await page.waitForFunction(() =>
		Boolean(
			customElements.get('store-agent-tools') &&
			customElements.get('cart-form') &&
			customElements.get('cart-count'),
		),
	);
	expect(await page.evaluate(() => 'modelContext' in document)).toBe(false);

	await page.evaluate(installFakeModelContext);
	await page.evaluate(() => window.dispatchEvent(new Event('focus')));

	await expect
		.poll(() => toolNames(page))
		.toEqual(expect.arrayContaining(['add_to_cart', 'show_variant', 'get_cart', 'search_catalog', 'create_cart']));
	expect(messages).toEqual([]);
	const result = await execute(page, 'add_to_cart', { item: { id: fieldShirtM }, quantity: 1 });
	expect(result.isError).toBeFalsy();
	await expect(page.locator('cart-count [data-ref="value"]')).toHaveText('1');
});

test('the cart works without JavaScript', async ({ browser, baseURL }) => {
	const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
	const page = await context.newPage();

	await page.goto('/products/steel-bottle');
	await page.getByText('750 ml').click();
	await page.getByRole('button', { name: 'Add to cart' }).click();

	await expect(page).toHaveURL(/\/cart$/u);
	await expect(page.locator('.cart-line')).toHaveCount(1);
	await expect(page.locator('.cart-line__variant')).toHaveText('750 ml');
	await context.close();
});

test('the cart page says a line is short of what a form without JavaScript asked for', async ({ browser, baseURL }) => {
	const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
	const page = await context.newPage();

	await page.goto('/products/canvas-tote');
	await page.locator('cart-form input[name="quantity"]').fill('5');
	await page.getByRole('button', { name: 'Add to cart' }).click();

	await expect(page).toHaveURL(/\/cart\?notice=short/u);
	await expect(page.getByText('Canvas Tote: only 3 in stock, so the cart holds 3 instead of 5.')).toBeVisible();
	await expect(page.locator('.cart-line input[type="number"]')).toHaveValue('3');
	await context.close();
});
