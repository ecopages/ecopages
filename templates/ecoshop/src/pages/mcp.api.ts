import { definePost, sameOrigin } from '@ecopages/core';
import { z } from 'zod';
import { getCommerce } from '@/lib/commerce/provider.server';
import { handleMcpRequest } from '@/lib/mcp/store-mcp.server';
import { siteOrigin } from '@/lib/site-origin';

/**
 * The store's MCP server over Streamable HTTP, in stateless mode.
 *
 * @remarks
 * Only `POST` is exported: a stateless server opens no SSE stream and keeps no session, so `GET` and `DELETE`
 * answer 405, which MCP clients accept. MCP clients are not browsers and send no `Origin`, so `sameOrigin()` lets a
 * request with neither header through and refuses a browser request from another site with a JSON-RPC error.
 */
export const POST = definePost({
	middleware: [
		sameOrigin({
			allowNonBrowser: true,
			onReject: () =>
				Response.json(
					{ jsonrpc: '2.0', error: { code: -32000, message: 'Origin not allowed' }, id: null },
					{ status: 403 },
				),
		}),
	],
	schema: { body: z.unknown() },
	handler: async ({ request, body }) =>
		handleMcpRequest(request, { provider: getCommerce(), origin: siteOrigin }, body),
});
