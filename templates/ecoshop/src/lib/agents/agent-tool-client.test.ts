import { afterEach, describe, expect, it, vi } from 'vitest';
import { CART_CHANGE_EVENT } from '../cart/cart-events';
import { callAgentTool, hasModelContext } from './agent-tool-client';

type Captured = { url: string; init: RequestInit };

function stubPage(pathname: string, body: unknown) {
	const captured: Captured[] = [];
	const events: Array<{ type: string; detail: unknown }> = [];
	const assign = vi.fn();
	const reload = vi.fn();
	vi.stubGlobal('location', { pathname, assign, reload });
	vi.stubGlobal('window', {
		dispatchEvent: (event: CustomEvent) => {
			events.push({ type: event.type, detail: event.detail });
			return true;
		},
	});
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init: RequestInit) => {
			captured.push({ url, init });
			return Response.json(body);
		}),
	);
	return { captured, events, assign, reload };
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('WebMCP feature detection', () => {
	it('reports no WebMCP when document.modelContext is missing', () => {
		vi.stubGlobal('document', {});
		expect(hasModelContext()).toBe(false);
	});

	it('reports WebMCP when the browser exposes document.modelContext', () => {
		vi.stubGlobal('document', { modelContext: { registerTool: () => Promise.resolve() } });
		expect(hasModelContext()).toBe(true);
	});
});

describe('callAgentTool', () => {
	it('runs the tool for the current product and updates the header count before it returns', async () => {
		const page = stubPage('/products/field-shirt', {
			result: { content: [{ type: 'text', text: 'ok' }], structuredContent: { item_count: 2 } },
			cart: { totalQuantity: 2, subtotal: '$136.00' },
		});
		const onCartChange = vi.fn();

		const result = await callAgentTool('add_to_cart', { quantity: 2 }, new AbortController().signal, {
			onCartChange,
		});

		expect(page.captured[0]?.url).toBe('/api/agent-tools/add_to_cart?product=field-shirt');
		expect(JSON.parse(String(page.captured[0]?.init.body))).toEqual({ quantity: 2 });
		expect(page.events).toEqual([{ type: CART_CHANGE_EVENT, detail: { totalQuantity: 2, subtotal: '$136.00' } }]);
		expect(onCartChange).toHaveBeenCalledOnce();
		expect(result.structuredContent).toEqual({ item_count: 2 });
	});

	it('returns the result first, then opens the page the tool named', async () => {
		vi.useFakeTimers();
		const page = stubPage('/', {
			result: { content: [{ type: 'text', text: 'Opening' }], structuredContent: {} },
			navigateTo: 'https://shop.test/collections/home',
		});

		await callAgentTool('browse_store', { collection: 'home', navigate: true }, new AbortController().signal);

		expect(page.assign).not.toHaveBeenCalled();
		vi.runAllTimers();
		expect(page.assign).toHaveBeenCalledWith('https://shop.test/collections/home');
	});

	it('refreshes the cart page after a cart change', async () => {
		vi.useFakeTimers();
		const page = stubPage('/cart', {
			result: { content: [{ type: 'text', text: 'ok' }], structuredContent: {} },
			cart: { totalQuantity: 0, subtotal: null },
		});

		await callAgentTool('cancel_cart', {}, new AbortController().signal);
		vi.runAllTimers();

		expect(page.reload).toHaveBeenCalledOnce();
	});

	it('rejects when the store cannot run the tool', async () => {
		stubPage('/', {});
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('', { status: 404 })),
		);

		await expect(callAgentTool('drop_tables', {}, new AbortController().signal)).rejects.toThrow(/404/u);
	});
});
