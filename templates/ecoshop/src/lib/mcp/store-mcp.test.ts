import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDemoProvider } from '@/lib/commerce/demo/demo-provider';
import { handleMcpRequest } from './store-mcp.server';

const ORIGIN = 'https://shop.test';
const provider = createDemoProvider();

let server: Server;
let endpoint: URL;
let client: Client;

/**
 * Serves `handleMcpRequest` over real HTTP, the way the `/mcp` endpoint file hands it the Web `Request`.
 */
async function bridge(req: IncomingMessage, res: ServerResponse): Promise<void> {
	const headers = new Headers();
	for (const [name, value] of Object.entries(req.headers)) {
		if (typeof value === 'string') headers.set(name, value);
	}
	const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
	const request = new Request(new URL(req.url ?? '/', endpoint), {
		method: req.method,
		headers,
		body: hasBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : undefined,
		duplex: 'half',
	} as RequestInit);
	const response = await handleMcpRequest(request, { provider, origin: ORIGIN });
	res.writeHead(response.status, Object.fromEntries(response.headers));
	res.end(Buffer.from(await response.arrayBuffer()));
}

type ToolResult = {
	isError?: boolean;
	content: Array<{ type: string; text?: string }>;
	structuredContent?: Record<string, unknown>;
};

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
	return (await client.callTool({ name, arguments: args })) as ToolResult;
}

beforeAll(async () => {
	server = createServer((req, res) => {
		bridge(req, res).catch((error: unknown) => {
			res.writeHead(500).end(String(error));
		});
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	endpoint = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`);
	client = new Client({ name: 'ecoshop-test', version: '1.0.0' });
	await client.connect(new StreamableHTTPClientTransport(endpoint));
});

afterAll(async () => {
	await client.close();
	await new Promise((resolve) => server.close(resolve));
});

describe('store MCP server', () => {
	it('lists the shared storefront tools that need no browser', async () => {
		const { tools } = await client.listTools();

		expect(tools.map((tool) => tool.name).sort()).toEqual([
			'ask_business',
			'browse_store',
			'cancel_cart',
			'create_cart',
			'get_cart',
			'get_product',
			'proceed_to_checkout',
			'search_catalog',
			'update_cart',
		]);
	});

	it('marks tools whose only change is opening a page as read-only over /mcp', async () => {
		const { tools } = await client.listTools();
		const hints = Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations]));

		expect(hints.browse_store).toMatchObject({ readOnlyHint: true });
		expect(hints.get_product).toMatchObject({ readOnlyHint: true });
		expect(hints.cancel_cart).toMatchObject({ readOnlyHint: false, destructiveHint: true });
	});

	it('searches the catalog', async () => {
		const result = await callTool('search_catalog', { catalog: { query: 'shirt' } });

		expect(result.isError).toBeFalsy();
		expect(result.structuredContent?.products).toEqual([
			expect.objectContaining({
				handle: 'field-shirt',
				title: 'Field Shirt',
				price_range: { amount: 6800, currency: 'USD', display: '$68.00' },
				url: `${ORIGIN}/products/field-shirt`,
			}),
			expect.objectContaining({ handle: 'linen-overshirt' }),
			expect.objectContaining({ handle: 'trail-tee' }),
		]);
	});

	it('creates a cart and reads it back by id', async () => {
		const variantId = 'gid://ecoshop/ProductVariant/field-shirt-m';
		const created = await callTool('create_cart', {
			cart: { line_items: [{ item: { id: variantId }, quantity: 2 }] },
		});
		const id = created.structuredContent?.id as string;

		expect(created.isError).toBeFalsy();
		expect(id).toEqual(expect.any(String));

		const checkout = await callTool('proceed_to_checkout', { id });
		expect(checkout.structuredContent).toMatchObject({ navigating_to: `${ORIGIN}/demo-checkout`, item_count: 2 });

		const read = await callTool('get_cart', { id });
		expect(read.structuredContent).toMatchObject({
			id,
			line_items: [expect.objectContaining({ quantity: 2, item: expect.objectContaining({ id: variantId }) })],
		});
	});

	it('changes the listed lines of the cart named by its id and keeps the others', async () => {
		const created = await callTool('create_cart', {
			cart: { line_items: [{ item: { id: 'gid://ecoshop/ProductVariant/canvas-tote' }, quantity: 1 }] },
		});
		const id = created.structuredContent?.id as string;

		const updated = await callTool('update_cart', {
			id,
			cart: { line_items: [{ item: { id: 'gid://ecoshop/ProductVariant/beeswax-wraps' }, quantity: 3 }] },
		});

		expect(updated.structuredContent).toMatchObject({
			item_count: 4,
			line_items: [
				expect.objectContaining({ quantity: 1, item: expect.objectContaining({ title: 'Canvas Tote' }) }),
				expect.objectContaining({ quantity: 3, item: expect.objectContaining({ title: 'Beeswax Wraps' }) }),
			],
		});
	});

	it('reports a sold-out variant as a tool error', async () => {
		const result = await callTool('create_cart', {
			cart: { line_items: [{ item: { id: 'gid://ecoshop/ProductVariant/linen-overshirt-l' }, quantity: 1 }] },
		});

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toMatch(/sold out/u);
	});

	it('names the missing field when the input is invalid', async () => {
		const result = await callTool('search_catalog', {});

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toMatch(/catalog/u);
	});

	it('names the product id when get_product has none', async () => {
		const result = await callTool('get_product', {});

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toMatch(/catalog\.id/u);
	});

	it('reports an unknown product as a tool error', async () => {
		const result = await callTool('get_product', { catalog: { id: 'missing' } });

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toMatch(/No product/u);
	});

	it('returns a product with its variants', async () => {
		const result = await callTool('get_product', { catalog: { id: 'steel-bottle' } });

		expect(result.structuredContent).toMatchObject({
			handle: 'steel-bottle',
			images: [`${ORIGIN}/demo/steel-bottle.svg`],
			variants: [
				expect.objectContaining({ title: '500 ml', price: expect.objectContaining({ display: '$24.00' }) }),
				expect.objectContaining({ title: '750 ml', price: expect.objectContaining({ display: '$29.00' }) }),
			],
		});
	});

	it('lists collections with their URLs', async () => {
		const result = await callTool('browse_store', {});

		expect(result.structuredContent?.collections).toContainEqual(
			expect.objectContaining({ handle: 'home', url: `${ORIGIN}/collections/home` }),
		);
	});
});
