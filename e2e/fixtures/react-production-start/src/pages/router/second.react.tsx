/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { RouterLayout } from '../../layouts/router-layout.react';

export default eco.page<{}, ReactNode>({
	layout: RouterLayout,
	metadata: () => ({ title: 'Router second' }),
	render: () => (
		<main>
			<h1>router-second</h1>
		</main>
	),
});
