import { describe, expect, it } from 'vitest';
import { readCartId } from '@/lib/cart/cart-cookie';
import { createDemoProvider } from '@/lib/commerce/demo/demo-provider';
import { handleAgentToolCall, handleAgentToolList } from './agent-tools-endpoint.server';

const provider = createDemoProvider();
const fieldShirtM = 'gid://ecoshop/ProductVariant/field-shirt-m';

function call(name: string, input: unknown, headers: Record<string, string> = {}, query = ''): Promise<Response> {
	return handleAgentToolCall(
		new Request(`https://shop.test/api/agent-tools/${name}${query}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...headers },
			body: JSON.stringify(input),
		}),
		name,
		provider,
	);
}

const cookieFrom = (response: Response) => (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

describe('agent tools endpoint', () => {
	it('lists the page tools with their JSON schemas', async () => {
		const response = await handleAgentToolList();
		const tools = (await response.json()) as Array<{ name: string; inputSchema: { type: string } }>;

		expect(tools.map((tool) => tool.name)).toContain('add_to_cart');
		expect(tools.every((tool) => tool.inputSchema.type === 'object')).toBe(true);
	});

	it("runs a cart tool on the visitor's cookie cart and stores the new cart", async () => {
		const response = await call(
			'add_to_cart',
			{ item: { id: fieldShirtM }, quantity: 2 },
			{},
			'?product=field-shirt',
		);
		const body = (await response.json()) as {
			result: { structuredContent: { item_count: number } };
			cart: unknown;
		};

		expect(response.status).toBe(200);
		expect(body.result.structuredContent.item_count).toBe(2);
		expect(body.cart).toEqual({ totalQuantity: 2, subtotal: '$136.00' });
		const cart = await provider.getCart(readCartId(new Headers({ cookie: cookieFrom(response) })) ?? '');
		expect(cart?.lines[0]).toMatchObject({ variantId: fieldShirtM, quantity: 2 });
	});

	it('defaults get_product to the product of the calling page', async () => {
		const response = await call('get_product', {}, {}, '?product=canvas-tote');

		expect(((await response.json()) as { result: { structuredContent: { handle: string } } }).result).toMatchObject(
			{
				structuredContent: { handle: 'canvas-tote' },
			},
		);
	});

	it('returns the tool error and sets no cookie for invalid input', async () => {
		const response = await call('add_to_cart', { item: { id: fieldShirtM }, quantity: 'two' });
		const body = (await response.json()) as { result: { isError: boolean; content: Array<{ text: string }> } };

		expect(body.result.isError).toBe(true);
		expect(body.result.content[0]?.text).toMatch(/quantity/u);
		expect(response.headers.get('set-cookie')).toBeNull();
	});

	it('tells the page where to navigate', async () => {
		const response = await call('browse_store', { collection: 'home', navigate: true });

		expect(await response.json()).toMatchObject({ navigateTo: 'http://localhost:3000/collections/home' });
	});

	it('refuses a call from another site', async () => {
		const response = await call('get_cart', {}, { Origin: 'https://evil.test' });

		expect(response.status).toBe(403);
	});

	it('answers 404 for a tool the page does not have', async () => {
		const response = await call('drop_tables', {});

		expect(response.status).toBe(404);
	});
});
