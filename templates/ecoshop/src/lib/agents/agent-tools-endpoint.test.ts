import { describe, expect, it } from 'vitest';
import { readCartId } from '@/lib/cart/cart-cookie';
import { createDemoProvider } from '@/lib/commerce/demo/demo-provider';
import type { CommerceProvider } from '@/lib/commerce/types';
import { handleAgentToolCall } from './agent-tools-endpoint.server';

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
		input,
	);
}

const cookieFrom = (response: Response) => (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

describe('agent tools endpoint', () => {
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

	it('answers with URLs on the origin of the request, so the page opens them on the host that serves it', async () => {
		const response = await call('browse_store', { collection: 'home', navigate: true });

		const body = (await response.json()) as { navigateTo: string; result: { structuredContent: unknown } };
		expect(body.navigateTo).toBe('https://shop.test/collections/home');
		expect(body.result.structuredContent).toMatchObject({ url: 'https://shop.test/collections/home' });
	});

	it("keeps the full URL of the provider's checkout", async () => {
		const checkoutUrl = 'https://checkout.shop.test/cart/c/abc';
		const offSite: CommerceProvider = {
			...provider,
			getCart: async (cartId) => {
				const cart = await provider.getCart(cartId);
				return cart && { ...cart, checkoutUrl };
			},
		};
		const added = await call('create_cart', { cart: { line_items: [{ item: { id: fieldShirtM }, quantity: 1 }] } });
		const response = await handleAgentToolCall(
			new Request('https://shop.test/api/agent-tools/proceed_to_checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: cookieFrom(added) },
				body: JSON.stringify({}),
			}),
			'proceed_to_checkout',
			offSite,
			{},
		);

		expect(await response.json()).toMatchObject({ navigateTo: checkoutUrl });
	});

	it('answers 404 for a tool the page does not have', async () => {
		const response = await call('drop_tables', {});

		expect(response.status).toBe(404);
	});
});
