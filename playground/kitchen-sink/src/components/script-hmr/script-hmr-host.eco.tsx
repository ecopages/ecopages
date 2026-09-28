/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

export const ScriptHmrHost = eco.component<{}, JsxRenderable>({
	integration: 'ecopages-jsx',
	dependencies: {
		scripts: ['./script-hmr-marker.eco.tsx', './script-hmr-widget.script.tsx'],
	},
	render: () => (
		<>
			<script-hmr-marker />
			<script-hmr-widget />
		</>
	),
});
