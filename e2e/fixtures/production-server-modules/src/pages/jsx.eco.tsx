/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import { JsxLayout } from '../layouts/jsx-layout.eco';

export default eco.page({
	layout: JsxLayout,
	metadata: () => ({ title: 'JSX static' }),
	dependencies: {
		scripts: [{ src: './radiant-production-probe.script.tsx', ssr: true }],
	},
	render: () => (
		<>
			<h1>jsx-static</h1>
			<radiant-production-probe />
		</>
	),
});
