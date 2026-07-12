/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import './script-hmr-widget.script.tsx';

export const ScriptHmrWidget = eco.component<{}, JsxRenderable>({
	integration: 'ecopages-jsx',
	dependencies: {
		scripts: ['./script-hmr-widget.script.tsx'],
	},
	render: () => <script-hmr-widget />,
});
