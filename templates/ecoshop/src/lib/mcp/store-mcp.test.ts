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
	it('lists the storefront tools', async () => {
		const { tools } = await client.listTools();

		expect(tools.map((tool) => tool.name).sort()).toEqual([
			'get_cart',
			'get_product',
			'list_collections',
			'search_products',
			'update_cart',
		]);
	});

	it('searches the catalog', async () => {
		const result = await callTool('search_products', { query: 'shirt' });

		expect(result.isError).toBeFalsy();
		expect(result.structuredContent?.products).toEqual([
			expect.objectContaining({
				handle: 'field-shirt',
				title: 'Field Shirt',
				price: '$68.00',
				url: `${ORIGIN}/products/field-shirt`,
			}),
			expect.objectContaining({ handle: 'linen-overshirt' }),
			expect.objectContaining({ handle: 'trail-tee' }),
		]);
	});

	it('creates a cart and reads it back', async () => {
		const variantId = 'gid://ecoshop/ProductVariant/field-shirt-m';
		const updated = await callTool('update_cart', { lines: [{ variantId, quantity: 2 }] });
		const cart = updated.structuredContent?.cart as { id: string; checkoutUrl: string } | undefined;

		expect(updated.isError).toBeFalsy();
		expect(cart?.id).toEqual(expect.any(String));
		expect(cart?.checkoutUrl).toBe(`${ORIGIN}/demo-checkout`);

		const read = await callTool('get_cart', { cartId: cart?.id });
		expect(read.structuredContent?.cart).toMatchObject({
			id: cart?.id,
			lines: [expect.objectContaining({ variantId, quantity: 2 })],
		});
	});

	it('changes the cart named by its id', async () => {
		const first = await callTool('update_cart', {
			lines: [{ variantId: 'gid://ecoshop/ProductVariant/canvas-tote', quantity: 1 }],
		});
		const cartId = (first.structuredContent?.cart as { id: string } | undefined)?.id;

		const second = await callTool('update_cart', {
			cartId,
			lines: [{ variantId: 'gid://ecoshop/ProductVariant/beeswax-wraps', quantity: 3 }],
		});

		expect(second.structuredContent?.cart).toMatchObject({
			totalQuantity: 4,
			lines: [
				expect.objectContaining({ productTitle: 'Canvas Tote', quantity: 1 }),
				expect.objectContaining({ productTitle: 'Beeswax Wraps', quantity: 3 }),
			],
		});
	});

	it('reports a sold-out variant as a tool error', async () => {
		const result = await callTool('update_cart', {
			lines: [{ variantId: 'gid://ecoshop/ProductVariant/linen-overshirt-l', quantity: 1 }],
		});

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toMatch(/sold out/u);
	});

	it('names the missing field when the input is invalid', async () => {
		const result = await callTool('get_product', {});

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toMatch(/handle/u);
	});

	it('reports an unknown product as a tool error', async () => {
		const result = await callTool('get_product', { handle: 'missing' });

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toMatch(/No product/u);
	});

	it('returns a product with its variants', async () => {
		const result = await callTool('get_product', { handle: 'steel-bottle' });

		expect(result.structuredContent).toMatchObject({
			handle: 'steel-bottle',
			markdownUrl: `${ORIGIN}/products/steel-bottle/index.md`,
			images: [`${ORIGIN}/demo/steel-bottle.svg`],
			variants: [
				expect.objectContaining({ title: '500 ml', price: '$24.00', available: true }),
				expect.objectContaining({ title: '750 ml', price: '$29.00' }),
			],
		});
	});

	it('lists collections with their URLs', async () => {
		const result = await callTool('list_collections', {});

		expect(result.structuredContent?.collections).toContainEqual(
			expect.objectContaining({ handle: 'home', url: `${ORIGIN}/collections/home` }),
		);
	});

	it('refuses a browser request from another origin', async () => {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
				Origin: 'https://evil.test',
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
		});

		expect(response.status).toBe(403);
	});
});
