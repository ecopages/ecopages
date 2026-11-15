/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import { JsxLayout } from '../../layouts/jsx-layout.eco';

const layout = JsxLayout;

export default eco.page({
	layout,
	cache: 'dynamic',
	metadata: () => ({ title: 'JSX dynamic' }),
	render: ({ params }) => <h1>jsx-dynamic {String(params.slug)}</h1>,
});
