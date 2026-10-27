/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { ReactLayout } from '../../layouts/react-layout.react';

export default eco.page({
	layout: ReactLayout,
	cache: 'dynamic',
	metadata: () => ({ title: 'React dynamic' }),
	render: ({ params }) => <h1>react-dynamic {String(params.slug)}</h1>,
});
