/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { RouterLayout } from '../../layouts/router-layout.react';

export default eco.page<{}, ReactNode>({
	layout: RouterLayout,
	metadata: () => ({ title: 'Router first' }),
	render: () => (
		<main>
			<h1>router-first</h1>
		</main>
	),
});
