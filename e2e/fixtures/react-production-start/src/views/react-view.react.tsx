/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { Counter } from '../components/counter.react';

export default eco.page<{}, ReactNode>({
	dependencies: { components: [Counter] },
	metadata: () => ({ title: 'React view' }),
	render: () => (
		<main>
			<h1>react-view</h1>
			<Counter />
		</main>
	),
});
