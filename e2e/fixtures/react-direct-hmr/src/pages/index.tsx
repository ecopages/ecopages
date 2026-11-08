import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { LitCounter } from '@/components/lit-counter.lit';

export default eco.page<Record<string, never>, ReactNode>({
	dependencies: {
		components: [LitCounter],
	},
	metadata: () => ({ title: 'Direct HMR', description: 'Direct HMR of a foreign Lit Component' }),
	render: () => (
		<main data-testid="page">
			<h1>Direct HMR</h1>
			<LitCounter count={1} />
		</main>
	),
});
