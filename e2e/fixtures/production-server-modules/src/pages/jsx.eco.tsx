/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import { JsxLayout } from '../layouts/jsx-layout.eco';

export default eco.page({
	layout: JsxLayout,
	metadata: () => ({ title: 'JSX static' }),
	render: () => <h1>jsx-static</h1>,
});
