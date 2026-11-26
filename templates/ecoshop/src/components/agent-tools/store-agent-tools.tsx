import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

/**
 * The host that offers the store's tools to an agent in the shopper's browser, through WebMCP.
 */
export const StoreAgentToolsHost = eco.component<{}, JsxRenderable>({
	dependencies: {
		scripts: ['./store-agent-tools.script.ts'],
	},
	render: () => <store-agent-tools data-eco-persist="store-agent-tools" hidden />,
});
