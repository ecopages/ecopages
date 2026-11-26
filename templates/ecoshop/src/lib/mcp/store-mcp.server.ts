import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { runStoreTool, storeTools } from '@/lib/agents/store-tools.server';
import type { CommerceProvider } from '@/lib/commerce/types';
import { isSameOriginRequest } from '@/lib/http/same-origin';

export interface StoreMcpOptions {
	provider: CommerceProvider;
	/** Origin for the absolute URLs the tools return. */
	origin: string;
}

/**
 * Builds the store's MCP server from the shared tool definitions, the same ones the storefront pages register
 * with WebMCP.
 *
 * @remarks
 * Over `/mcp` there is no shopper session, so cart tools name their cart with `id`, and tools that only move a
 * browser (`show_variant`, and `add_to_cart` of a product page) are not offered. A failed lookup or a refused cart
 * change is a tool error (`isError`), so the calling model sees it and can recover; input that fails a schema is
 * rejected by the SDK before the tool runs.
 */
export function createStoreMcpServer({ provider, origin }: StoreMcpOptions): McpServer {
	const server = new McpServer(
		{ name: 'ecoshop', version: '1.0.0' },
		{
			instructions:
				'Storefront tools. Find products with search_catalog or browse_store, read variants with get_product, then put variant ids in a cart with create_cart. Keep the cart id it returns and pass it as id to get_cart, update_cart, cancel_cart and proceed_to_checkout. Checkout happens in the browser: give the shopper the checkout URL. Store policies: ask_business.',
		},
	);

	for (const tool of storeTools.filter((entry) => entry.surfaces.includes('mcp'))) {
		const {
			idempotentHint,
			readOnlyHint,
			untrustedContentHint: _untrusted,
			consequentialHint: _consequential,
		} = tool.annotations;
		server.registerTool(
			tool.name,
			{
				title: tool.title,
				description: tool.description,
				inputSchema: tool.input,
				annotations: { readOnlyHint, idempotentHint, destructiveHint: false, openWorldHint: false },
			},
			async (input) => {
				const { result } = await runStoreTool(tool.name, input, {
					provider,
					origin,
					surface: 'mcp',
					cartId: undefined,
				});
				return {
					content: result.content,
					structuredContent: result.structuredContent,
					isError: result.isError,
				};
			},
		);
	}

	return server;
}

/**
 * Answers one Streamable HTTP request to `/mcp` with a fresh server, so no state is kept between requests.
 *
 * @remarks
 * Stateless mode with JSON responses: every tool here answers in one step, so the transport needs no session or
 * SSE stream, and the endpoint works the same on Node, Bun and serverless hosts.
 */
export async function handleMcpRequest(request: Request, options: StoreMcpOptions): Promise<Response> {
	if (!isSameOriginRequest(request, options.origin)) {
		return Response.json(
			{ jsonrpc: '2.0', error: { code: -32000, message: 'Origin not allowed' }, id: null },
			{ status: 403 },
		);
	}

	const server = createStoreMcpServer(options);
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});
	await server.connect(transport);
	try {
		return await transport.handleRequest(request);
	} finally {
		await server.close();
	}
}
