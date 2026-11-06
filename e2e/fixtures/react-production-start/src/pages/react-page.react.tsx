/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { Counter } from '../components/counter.react';

export default eco.page<{}, ReactNode>({
	dependencies: { components: [Counter] },
	metadata: () => ({ title: 'Hydrated React Page' }),
	render: () => (
		<main>
			<h1>react-page</h1>
			<Counter />
		</main>
	),
});
