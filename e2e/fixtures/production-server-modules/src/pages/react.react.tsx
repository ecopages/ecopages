/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { ReactLayout } from '../layouts/react-layout.react';

export default eco.page({
	layout: ReactLayout,
	metadata: () => ({ title: 'React static' }),
	render: () => <h1>react-static</h1>,
});
