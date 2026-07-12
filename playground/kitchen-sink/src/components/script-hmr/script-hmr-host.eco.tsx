/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ScriptHmrWidget } from './script-hmr-widget';

export const ScriptHmrHost = eco.component<{}, JsxRenderable>({
	integration: 'ecopages-jsx',
	dependencies: {
		scripts: ['./script-hmr-marker.eco.tsx'],
		components: [ScriptHmrWidget],
	},
	render: () => (
		<>
			<script-hmr-marker />
			<ScriptHmrWidget />
		</>
	),
});
