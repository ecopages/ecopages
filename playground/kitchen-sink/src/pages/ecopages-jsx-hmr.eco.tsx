/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { EcopagesJsxHmrLayout } from '@/layouts/ecopages-jsx-hmr-layout.eco';

export default eco.page<{}, JsxRenderable>({
	integration: 'ecopages-jsx',
	dependencies: {
		components: [EcopagesJsxHmrLayout],
	},
	layout: EcopagesJsxHmrLayout,
	metadata: () => ({
		title: 'Ecopages JSX HMR Fixture',
		description: 'Validates Ecopages JSX page refreshes preserve the shared Layout.',
	}),
	render: () => <h1>Ecopages JSX HMR baseline</h1>,
});
