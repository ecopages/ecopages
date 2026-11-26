import { expect, type Page } from '@playwright/test';
import { test } from '../../app-fixture.ts';

type ToolResult = { isError?: boolean; content: Array<{ text: string }>; structuredContent: Record<string, unknown> };

/**
 * A stand-in for the browser's WebMCP `document.modelContext`, injected before any page script runs. It behaves
 * like the spec: `registerTool` rejects a duplicate name, and a tool leaves the list only when the signal it was
 * registered with aborts.
 */
function installFakeModelContext(): void {
	type Tool = { name: string; execute(input: unknown, options: { signal: AbortSignal }): Promise<unknown> };
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

	test("an agent adds to the visitor's cart and the header count follows without a page load", async ({ page }) => {
		await page.goto('/products/field-shirt');
		await expect.poll(() => toolNames(page)).toContain('add_to_cart');
		await page.evaluate(() => Object.assign(window, { __samePage: true }));

		const result = await execute(page, 'add_to_cart', { item: { id: fieldShirtM }, quantity: 2 });

		expect(result.isError).toBeFalsy();
		expect(result.structuredContent).toMatchObject({ item_count: 2 });
		await expect(page.locator('cart-count [data-ref="value"]')).toHaveText('2');
		expect(await page.evaluate(() => (window as unknown as { __samePage?: boolean }).__samePage)).toBe(true);

		const cart = await execute(page, 'get_cart', {});
		expect(cart.structuredContent).toMatchObject({
			line_items: [expect.objectContaining({ quantity: 2, item: expect.objectContaining({ id: fieldShirtM }) })],
		});
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

	test('invalid input names the field and changes nothing', async ({ page }) => {
		await page.goto('/products/field-shirt');
		await expect.poll(() => toolNames(page)).toContain('add_to_cart');

		const result = await execute(page, 'add_to_cart', { item: { id: fieldShirtM }, quantity: 0 });

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toMatch(/quantity/u);
		const cart = await execute(page, 'get_cart', {});
		expect(cart.structuredContent).toMatchObject({ item_count: 0 });
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
	await page.waitForLoadState('networkidle');

	expect(await page.evaluate(() => 'modelContext' in document)).toBe(false);
	expect(toolRequests).toEqual([]);
	expect(messages).toEqual([]);
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
