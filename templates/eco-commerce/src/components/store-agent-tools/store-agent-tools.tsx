import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

export type StoreAgentToolsProps = {
	collection?: string;
	category?: string;
};

/** Registers the site-wide WebMCP tools; it renders nothing visible. */
export const StoreAgentTools = eco.component<StoreAgentToolsProps, JsxRenderable>({
	dependencies: {
		scripts: ['./store-agent-tools.script.ts'],
	},
	render: ({ collection = '', category = '' }) => (
		<store-agent-tools attr:collection={collection} attr:category={category} hidden />
	),
});
