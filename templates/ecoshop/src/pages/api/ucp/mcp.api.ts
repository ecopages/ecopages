import { definePost } from '@ecopages/core';
import { getCommerce } from '@/lib/commerce/provider.server';
import { handleUcpMcp } from '@/lib/ucp/ucp.server';

/**
 * The connected store's UCP endpoint, forwarded: catalog search and lookup and the cart of the store itself.
 *
 * @remarks
 * Only `POST` is exported, as the MCP endpoint of Streamable HTTP asks. On the demo catalog it answers 404.
 */
export const POST = definePost({
	handler: async ({ request }) => handleUcpMcp(request, { provider: getCommerce() }),
});
