import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

/**
 * The host that offers the store's tools to an agent in the shopper's browser, through WebMCP.
 *
 * @remarks
 * `ucp` is set for a connected Shopify store, which adds `get_ucp_profile`.
 */
export const StoreAgentToolsHost = eco.component<{ ucp?: boolean }, JsxRenderable>({
	dependencies: {
		scripts: ['./store-agent-tools.script.ts'],
	},
	render: ({ ucp = false }) => <store-agent-tools bool:ucp={ucp} data-eco-persist="store-agent-tools" hidden />,
});
