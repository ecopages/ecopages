import { definePost } from '@ecopages/core';
import { getCommerce } from '@/lib/commerce/provider.server';
import { handleMcpRequest } from '@/lib/mcp/store-mcp.server';
import { siteOrigin } from '@/lib/site-origin';

/**
 * The store's MCP server over Streamable HTTP, in stateless mode.
 *
 * @remarks
 * Only `POST` is exported: a stateless server opens no SSE stream and keeps no session, so `GET` and `DELETE`
 * answer 405, which MCP clients accept.
 */
export const POST = definePost({
	handler: async ({ request }) => handleMcpRequest(request, { provider: getCommerce(), origin: siteOrigin }),
});
